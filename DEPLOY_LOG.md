# DEPLOY_LOG

Ημερολόγιο των deploys στην παραγωγή (`ph-aros.com` / `app.ph-aros.com`, Hetzner).
Γράφεται μόνο από το routine `pharos-deploy`, που είναι και το μόνο που επιτρέπεται να αλλάξει
τι τρέχει στην παραγωγή. Κάθε εγγραφή κρατά το εύρος commits, τον exit code, τα health results
και τη διάρκεια.

Exit codes του `deploy/deploy-update.sh`:

| code | σημασία |
|---|---|
| 0 | έγινε deploy και είναι υγιές |
| 1 | αρνήθηκε να ξεκινήσει (ήδη άρρωστο, απέτυχε το backup, βρώμικο δέντρο). Τίποτα δεν άλλαξε. |
| 2 | έγινε deploy, απέτυχε το health, **έγινε rollback**. Η παραγωγή είναι εντάξει, τα νέα commits είναι σπασμένα. |
| 3 | απέτυχε και το rollback. Η παραγωγή είναι κάτω. |
| 4 | άλλο deploy ήταν ήδη σε εξέλιξη (lock κρατημένο). Τίποτα δεν άλλαξε, ξαναπροσπάθησε. |

---

## 2026-08-04 15:22 UTC — `b53bd9e5 → 89d49c85`, exit 0

Πρώτη εγγραφή αυτού του αρχείου. Ad-hoc εκτέλεση κατόπιν αιτήματος του Αχιλλέα («κάνε deploy τα
commits που μαζεύτηκαν»).

**Στάλθηκαν 3 commits**, όλα κείμενο και τοπικό config, μηδέν κώδικας εφαρμογής:

```
89d49c8 ops(alerts): wire CRON_SECRET through compose, and fix a doc caveat P82 made stale
65d4e2b docs(reviewer): 65th sweep, f44e227..75ee08d — new P1: settings Trash tenancy gap
56c7e85 docs(progress): log the P40 run, and what still blocks the check from firing
```

Αρχεία: `PROGRESS.md`, `WEB_DEBT.md`, `docker-compose.yml` (το τοπικό dev compose, ΟΧΙ το
`deploy/docker-compose.prod.yml`), `docs/self-hosting.md`. Μηδέν αρχεία κάτω από `apps/web/`,
`apps/landing/` ή `deploy/`, άρα το «rebuilding: (nothing, config only)» ήταν σωστό και όχι
παράλειψη. Επιβεβαιώθηκε ότι το `CRON_SECRET` υπάρχει ήδη στο περιβάλλον του `pharos-web`.

**Health**: pre-flight OK με την πρώτη προσπάθεια, post-deploy OK με την πρώτη. Διάρκεια περίπου
6 δευτερόλεπτα, αφού δεν χρειάστηκε build.

**Ανεξάρτητη επαλήθευση** (όχι μόνο η ετυμηγορία του script):

| έλεγχος | αποτέλεσμα |
|---|---|
| `https://ph-aros.com/` | 200, 386 KB, περιέχει landing markers |
| `https://app.ph-aros.com/account/login` | 200, 81 KB, σώμα διαφορετικό από το apex |
| `POST /api/cron/saas/trials-sweep` χωρίς token | 401 `{"error":"unauthorized"}` |
| `https://ph-aros.com/status` | 200, δηλαδή το `e5062b3` είναι ζωντανό |

### Τι βρήκε αυτό το run πριν πατήσει deploy

Η παραγωγή σέρβιρε **`b800fc3`** ενώ το HEAD του server ήταν `16d986d`. Το reflog δείχνει τρία
χειροκίνητα `git pull --ff-only` (15:10, 15:12, 15:17) που μετακίνησαν το checkout χωρίς να
ξαναχτιστεί τίποτα, και το `deploy/.deployed` δεν υπήρχε καθόλου, αφού ο μηχανισμός stamp μπήκε
μόλις στο `16d986d`. Χωρίς stamp, το script θα έπεφτε σε fallback στο HEAD, θα έβλεπε μόνο τρία
docs commits, δεν θα ξανάχτιζε τίποτα και θα ανέφερε επιτυχία, κλειδώνοντας ένα ψεύτικο stamp για
κάθε επόμενο deploy. Το κενό ήταν 20 commits με 11 αρχεία `apps/web/` και 6 `apps/landing/`, μέσα
τους τα `feat(expenses)` P46, `feat(alerts)` dedupe και `feat(landing)` status page.

Το stamp γράφτηκε χειροκίνητα από τον Αχιλλέα με την τιμή `b800fc3` (ο classifier μπλόκαρε δύο
φορές το γράψιμο από το routine). Είναι gitignored, οπότε δεν βρώμισε το δέντρο.

### Ταυτόχρονη εκτέλεση, παρ' ολίγον σύγκρουση

Ανάμεσα στο γράψιμο του stamp και στην εκκίνηση αυτού του run, **ένα δεύτερο deploy έτρεξε** και
κατανάλωσε το stamp: εικόνα `pharos-landing` χτίστηκε 15:20:20, `pharos-web` 15:22:00, containers
ξεκίνησαν 15:22:08. Αυτό είναι που πραγματικά έχτισε το εύρος `b800fc3..b53bd9e` και έγραψε stamp
`b53bd9e5`. Το δικό μας run ξεκίνησε 15:22:15, δηλαδή **7 δευτερόλεπτα** αργότερα, και βρήκε ένα
ήδη ενημερωμένο stamp.

Το αποτέλεσμα βγήκε σωστό, αλλά κατά τύχη. Το `deploy/deploy-update.sh` **δεν έχει lock**, οπότε
δύο ταυτόχρονες εκτελέσεις μπορούν να διαπλέξουν `git merge` και build και να φτιάξουν image από
ανάμεικτα commits. Το αντίστοιχο script του BakeCore πήρε ήδη `flock`. Ανοιχτό θέμα.

### Ανοιχτά

- Χωρίς lock στο `deploy-update.sh`, βλ. παραπάνω.
- Το `pharos-caddy` τρέχει από image id που δεν υπάρχει πια (`docker inspect` δίνει «no such
  object»). Το container δουλεύει, αλλά δεν μπορεί να ξαναδημιουργηθεί από αυτό το id. Ξεκίνησε
  11:18 και δεν έχει ανακατασκευαστεί έκτοτε.
- Τα χειροκίνητα `git pull` στον server είναι αυτά που δημιουργούν αυτή την κατηγορία προβλήματος
  εξαρχής. Το stamp τα καλύπτει πλέον, αρκεί να μη σβηστεί.

## 2026-08-04: χειροκίνητο deploy (interactive session, κατ' εντολή Αχιλλέα)

Εύρος: `89d49c85 → dc292d17` (4 commits).

    2f10b8f fix(api): scope every /api/v1 route to the caller's workspace   [tenancy/security]
    2dbab73 fix(deps): bump next σε 15.5.22, patched postcss/sharp           [security]
    ef10669 docs(deploy): πρώτη εγγραφή στο DEPLOY_LOG
    dc292d1 docs(ops): record the /api/v1 tenancy fix, and that it was not deployed

`--check` πρώτα: health OK. Μετά `deploy/deploy-update.sh`: exit 0, backup ok, rebuild `web` +
`landing`, recreate, health OK (attempt 1). Χωρίς rollback.

Ανεξάρτητη επαλήθευση: `ph-aros.com` 200 (landing content self-host/waitlist),
`app.ph-aros.com/account/login` 200, `POST /api/cron/saas/trials-sweep` χωρίς token → 401
`{"error":"unauthorized"}`.

Σημασία: ο tenancy/security fix που «δεν είχε deployed» (βλ. dc292d1) είναι πλέον live.

Κατάσταση: παραγωγή στο `dc292d17`, υγιής.

## 2026-08-04 (cont.): χειροκίνητο deploy — mobile discontinuation (interactive session, κατ' εντολή Αχιλλέα)

Εύρος: `dc292d17 → 2cc7d5ec` (5 commits).

    93a4046 fix(deploy): serialise deploys behind a flock lock (exit 4), like BakeCore
    c568a3b docs(deploy): log the 2026-08-04 manual deploy 89d49c85 -> dc292d17
    0a62c12 docs(reviewer): 66th sweep, api/v1 tenancy fix reviewed, exemplary
    1438867 feat(mobile)!: discontinue the mobile app, web-only from now on
    2cc7d5e docs+backlog: scrub mobile-app references, record the discontinuation decision

`--check` πρώτα: health OK. Μετά `deploy/deploy-update.sh`: exit 0, backup ok, rebuild
`caddy`+`landing`+`web`, recreate, health OK (attempt 1). Χωρίς rollback.

Ανεξάρτητη επαλήθευση: `ph-aros.com` 200 (landing content self-host/waitlist), nav πλέον χωρίς
«Mobile» link· `app.ph-aros.com/account/login` 200· `POST /api/cron/saas/trials-sweep` χωρίς
token → 401 `{"error":"unauthorized"}`. Έλεγχος επί σκοπού: raw HTML του `ph-aros.com` grep-αρίστηκε
για "mobile" — μόνο legitimate hits έμειναν (`mobile-drawer`/`MobileNav` = το responsive hamburger
nav, «mobile-first» tech-stack περιγραφή), το phone-mockup section + το nav link έφυγαν.

Σημασία: το mobile app (apps/mobile) καταργήθηκε αυτό το session (βλ. `OWNER_DECISIONS.md` #15,
commit `1438867`) — το landing site πλέον δεν διαφημίζει πράγμα που δεν υπάρχει.

Κατάσταση: παραγωγή στο `2cc7d5ec`, υγιής.

## 2026-08-04 20:52 UTC — `2cc7d5ec → 2743d638`, exit 0

Ad-hoc, κατόπιν ρητού αιτήματος («deploy it») αμέσως μετά τη διόρθωση.

**Στάλθηκαν 3 commits**, και τα δύο πρώτα είναι κώδικας εφαρμογής:

```
2743d63 fix(saas): close the front door, and un-clip the landing drawer
c318aff fix(saas): three reports from the phone — a see-through menu, AI settings that would
        not stick, and an import error with no error
e7ec225 docs(deploy): log the 2026-08-04 manual deploy dc292d17 -> 2cc7d5ec
```

**Γιατί επείγει**: το `2743d63` κλείνει τρύπα ασφαλείας που επιβεβαιώθηκε ζωντανά την ίδια μέρα.
Με `SAAS_MODE` on το middleware έκανε `return pass()` για τα πάντα, με το σκεπτικό ότι η
εξουσιοδότηση γίνεται πιο μέσα, στο `withRequestTenant`. Ίσχυε για τις σελίδες λογαριασμού και το
operator console, **όχι** για τις σελίδες του προϊόντος: το `https://home.ph-aros.com/` σέρβιρε το
hub, τα 14 module cards και το getting-started checklist χωρίς κανένα session.

Rebuild: **και τα δύο** services (`landing` + `web`), σωστά, αφού άλλαξαν αρχεία και στα δύο.
Διάρκεια build περίπου 4 λεπτά στα δύο cores (web 230s, landing 113s, παράλληλα).

**Health**: pre-flight OK με την πρώτη προσπάθεια, post-deploy OK με την πρώτη.

**Ανεξάρτητη επαλήθευση μετά το deploy** (όχι μόνο η ετυμηγορία του script):

| έλεγχος | αποτέλεσμα |
|---|---|
| `ph-aros.com/` | 200, σερβίρει landing (`self-host`), με ορατό `account/login` |
| `home.ph-aros.com/` signed out | **307 → `/account/login?next=%2F`** (ήταν 200 με όλο το προϊόν) |
| `app.ph-aros.com/` signed out | 307 → `/account/login?next=%2F` |
| `/receipts`, `/settings` signed out | 307 → login με σωστό `next` |
| `/setup` signed out | 307 → login (δεν προσφέρεται πια ο self-hosted wizard σε άγνωστο) |
| `/account/login`, `/account/signup`, `/account/reset` | 200, παραμένουν προσβάσιμα |
| `POST /api/cron/saas/trials-sweep` χωρίς token | 401 |
| landing drawer σε 375px | panel 812px, `rgb(20,20,20)`, parent `BODY` (ήταν 64px μέσα στο header) |

ΣΗΜ για μελλοντικό deploy: το health check του script ψάχνει `waitlist\|self-host` στο apex. Όταν
αφαιρεθεί το waitlist (ζητήθηκε), το `self-host` κρατά τον έλεγχο ζωντανό, αλλά αν αλλάξει και αυτό
το κείμενο πρέπει να ενημερωθεί το `deploy/deploy-update.sh` **στο ίδιο commit**, αλλιώς ο έλεγχος
θα δει υγιές deploy ως σπασμένο και θα κάνει άσκοπο rollback.

## 2026-08-04 21:12 UTC — `2743d638 → 63f2e333`, exit 0

Ad-hoc, κατόπιν αιτήματος («βάλε εσύ τα env και κάνε deploy»). Στάλθηκαν 2 commits, το ένα με
κώδικα και στα δύο apps:

```
63f2e33 feat(saas): a real way in and out — waitlist gone, plans lead to signup, plans
        activate by code
310de1d docs(deploy): log the 2026-08-04 deploy 2cc7d5ec -> 2743d638
```

**Αλλαγές env ΠΡΙΝ το deploy** (στο `deploy/.env.prod`, ώστε το recreate να τις πάρει):

- `SAAS_SUPERADMIN_EMAILS` — **υπήρχε ήδη** και περιλαμβάνει τον λογαριασμό του Αχιλλέα, οπότε
  το operator console ήταν ήδη ανοιχτό. Δεν χρειάστηκε αλλαγή.
- `SAAS_ACTIVATION_CODES` — **προστέθηκε**, ένας κωδικός για το `shared` πλάνο. Χωρίς αυτό το
  `/api/saas/billing/activate` απαντά 503, δηλαδή fails closed.

Το `.env.prod` έχει `env_file` στο web service, άρα **δεν** χρειάστηκε αλλαγή στο compose (σε
αντίθεση με το `CRON_SECRET`, που έπρεπε να περαστεί ρητά). Το αντίγραφο ασφαλείας του
`.env.prod` μετακινήθηκε **έξω** από το repo (`/root/pharos-env-backups/`), αλλιώς το untracked
αρχείο θα έκανε το δέντρο βρώμικο και το script θα αρνιόταν να ξεκινήσει (exit 1).

**Health**: pre-flight OK με την πρώτη, post-deploy OK με την πρώτη. Rebuild: landing + web.

**Ανεξάρτητη επαλήθευση μετά το deploy:**

| έλεγχος | αποτέλεσμα |
|---|---|
| αναφορές `waitlist` στο apex | **0** (ήταν ολόκληρο section + mailto) |
| `self-host` στο apex | 2 — **ο δείκτης του health check επιβιώνει** μετά την αφαίρεση του waitlist |
| CTA πλάνων | `…/account/signup?plan=shared` και `?plan=dedicated` |
| Sign in στο landing | `…/account/login` παρόν |
| `SAAS_ACTIVATION_CODES` μέσα στον container | present |
| `/`, `/receipts`, `/admin` χωρίς session | 307 → login (το gate κρατά) |
| `/account/login`, `/account/signup` | 200 |
| `POST /api/saas/billing/activate` χωρίς session | **401** |

ΣΗΜ: ο ίδιος ο κωδικός ενεργοποίησης δεν γράφεται εδώ. Ζει μόνο στο `.env.prod` και δόθηκε
στον Αχιλλέα στη συνομιλία.

## 2026-08-04 21:31 UTC — `63f2e333 → abd0cdcc`, exit 0

Ad-hoc. Ένα commit: το signup δείχνει πλέον το πλάνο που ήρθε από το `?plan=`, και διορθώθηκε
το σχόλιο για το build memory μετά το rescale σε **CX23 (2 vCPU, ~3.8 GB RAM + 4 GB swap)**.

**Το `NODE_BUILD_MEMORY` ΔΕΝ ανέβηκε**, παρόλο που το παλιό σχόλιο έλεγε «raise if you resize
up». web και landing χτίζουν **παράλληλα**, άρα 3072 στο καθένα είναι ήδη 6 GB πιθανή κορυφή
πάνω σε 3.8 GB πραγματικής μνήμης· ανεβάζοντας και τα δύο, η κορυφή γίνεται χειρότερη, όχι
ασφαλέστερη. Το 3072 έχει αποδειχθεί αρκετό (όλα τα builds πέτυχαν με αυτό, ακόμα και στο
μικρότερο μηχάνημα), οπότε η επιπλέον RAM πάει σε λιγότερο paging στο ίδιο ceiling.

**Health**: pre-flight OK με την πρώτη. Post-deploy: **502 στην 1η προσπάθεια, OK στη 2η** —
ακριβώς ο λόγος που ο έλεγχος κάνει retry· ένα container που μόλις ξαναδημιουργήθηκε θέλει
λίγα δευτερόλεπτα, και μια μονή δοκιμή θα είχε πυροδοτήσει άσκοπο rollback.

**Ανεξάρτητη επαλήθευση:**

| έλεγχος | αποτέλεσμα |
|---|---|
| `/account/signup?plan=shared` | «Get started with Pro», «€9/month», «activate this plan right after» |
| `?plan=dedicated` | «Get started with Dedicated», «€29/month» |
| `/account/signup` σκέτο | «Create your workspace» (αμετάβλητο) |
| `?plan=free` | κανένα notice (σωστά, δεν υπάρχει τι να επιβεβαιωθεί) |
| `?plan=enterprise<script>` | **δεν renders**· η μόνη εμφάνιση είναι escaped μέσα στο RSC flight payload του Next, `<script>alert` ως HTML = 0 |

## 2026-08-05 00:5x UTC — `618ff270 → d04d953d` (FORCE, env-only), exit 0

Ad-hoc («βάλε τα εσύ στο env και κάνε deploy»). **Μηδέν νέα commits** — η αλλαγή ήταν μόνο
περιβάλλοντος, οπότε χρειάστηκε **`FORCE=1`**: χωρίς αυτό το script βλέπει «already at
origin/main», δεν ξαναφτιάχνει containers, και το νέο env **δεν φτάνει ποτέ** στην εφαρμογή.
Αυτή ακριβώς είναι η παγίδα που περιγράφει το `deploy-update.sh` στο σχόλιό του.

**Προστέθηκαν στο `deploy/.env.prod`:**

```
SAAS_AI_MARKUP="2"
SAAS_AI_MIN_CHARGE="0.50"
```

Χωρίς markup, το `aiCharge` επιστρέφει μηδέν χρεώσιμο επίτηδες (μια εγκατάσταση που δεν έχει
αποφασίσει τιμολόγηση δεν πρέπει να αρχίσει σιωπηλά να χρεώνει). Το `ANTHROPIC_API_KEY`
**σκόπιμα ΔΕΝ μπήκε στο env**: το platform key ορίζεται πλέον από το `/admin`, κρυπτογραφημένο,
που ήταν και το ζητούμενο.

Το αντίγραφο του `.env.prod` πήγε ξανά στο `/root/pharos-env-backups/` (εκτός repo), αλλιώς το
untracked αρχείο βρωμίζει το δέντρο και το script αρνείται να ξεκινήσει.

**Health**: pre-flight OK με την πρώτη· post-deploy 502 στην 1η, OK στη 2η (γνωστό, ο retour
του retry μετά από recreate).

**Ανεξάρτητη επαλήθευση:**

| έλεγχος | αποτέλεσμα |
|---|---|
| env μέσα στον container | `markup=2 min=0.50` |
| `GET/PUT/DELETE /api/saas/admin/ai-key` χωρίς session | **401** και στα τρία |
| `/` χωρίς session | 307 → login |
| `/account/login` | 200 |

## 2026-08-05 ~08:5x UTC — `b6c5dc61 → ba23248c`, exit 0

Ad-hoc. Κλείδωμα του signup πίσω από κωδικό (private beta) + `SAAS_SIGNUP_CODES` στο
`deploy/.env.prod` πριν το deploy, ώστε το recreate να το πάρει.

**Δύο προηγούμενες απόπειρες είχαν κάνει ROLLBACK**, καμία από δικό μου κώδικα, και το script
κράτησε την παραγωγή όρθια και τις δύο φορές:
1. build error σε `giftcards/route.ts` (non-route export) — διορθώθηκε από άλλο routine (`57c718d`)
2. build error σε `goals/route.ts`, ίδια αιτία — διορθώθηκε από άλλο routine (`5e97992`)

**ΣΗΜ διάρκειας**: τα builds πήγαν από ~4 σε **>20 λεπτά** αφότου το Dockerfile πέρασε σε
`npm ci` με υποχρεωτικό lockfile (σωστή αλλαγή, ακυρώνει όμως το cached deps layer). Το ssh
από τον client κόβεται στα 10 λεπτά, οπότε το deploy τρέχει πλέον **detached** (`nohup … &`)
και γίνεται poll, αλλιώς η σύνδεση πεθαίνει ενώ το build συνεχίζει.

**Ανεξάρτητη επαλήθευση:**

| έλεγχος | αποτέλεσμα |
|---|---|
| `SAAS_SIGNUP_CODES` μέσα στον container | present |
| σελίδα signup | δείχνει «Invite code» + «private beta» |
| `POST /api/saas/auth/signup` χωρίς code | **403** με το μήνυμα private beta |
| ίδιο με ΛΑΘΟΣ code | **403** |

Ο κωδικός δεν γράφεται εδώ· ζει μόνο στο `.env.prod` και δόθηκε στη συνομιλία. Το happy path
(σωστός κωδικός → δημιουργία λογαριασμού) **δεν δοκιμάστηκε από εμένα**: θα σήμαινε να φτιάξω
λογαριασμό, που δεν το κάνω.

---

## 2026-08-05 13:0x UTC — `bbadfda9 → c58a79a1`, exit 0 (interactive session, χειροκίνητο)

Όχι το routine `pharos-deploy` — interactive συνεδρία, ρητό αίτημα Αχιλλέα («yes go on») μετά
από debugging live EACCES σφάλματος στο receipt import.

**Πλαίσιο**: ο Αχιλλέας ανέφερε `Failed to save file: EACCES: permission denied, mkdir
'/storage/receipts'` στο live SaaS. Αιτία: το `./storage:/storage` bind mount στο
`docker-compose.prod.yml` το είχε αυτόματα δημιουργήσει το Docker ως `root:root` (το `chown
nextjs:nodejs /storage` του image ισχύει μόνο μέσα στο layer, όχι σε runtime bind mount) —
διορθώθηκε **live** με `chown -R 1001:1001 /opt/pharos/deploy/storage` πριν από αυτό το deploy
(0 bytes υπήρχαν ακόμα εκεί, μηδέν data loss).

**3 commits, sequential**:
```
c58a79a feat(saas): enforce per-plan storage quotas on the actual write path
9f9ad3a fix(deploy): self-heal the storage bind-mount's ownership on every deploy
4793dae feat(items,expenses): bulk field-edit for selected records (P78)
```
(Το `bbadfda` — nav bug fix + settings-under-user-menu — είχε ήδη γίνει deploy από
ξεχωριστό, ταυτόχρονο τρέξιμο του `pharos-deploy` routine λίγο πριν, verified με `git log -1`
στο server πριν ξεκινήσει αυτό.)

- `9f9ad3a`: το ίδιο EACCES fix, μόνιμο πλέον — `mkdir -p && chown 1001:1001` idempotent στην
  αρχή κάθε deploy, ώστε να επιβιώνει rebuild του host / νέο volume χωρίς χειροκίνητο chown.
- `c58a79a`: `lib/storage.ts` έγινε tenant-aware (`STORAGE_ROOT/<dbName>/...` αντί για shared
  bucket) + πραγματική επιβολή quota πριν από κάθε write (`assertStorageQuota`) + real-time
  ledger (`recordStorageDelta`). Νέα όρια: Free 200MB, Pro 1GB, Dedicated 5GB (ήταν
  5/50/500GB placeholders). OSS parity αμετάβλητο (verified: 17 προϋπάρχοντα storage tests
  περνάνε χωρίς αλλαγή).
- `4793dae`: P78 bulk field-edit (category/status/tags) για Items/Expenses.

**Deploy**: `./deploy-update.sh --check` πρώτα βρήκε lock κρατημένο (exit 4, το ταυτόχρονο
`pharos-deploy` run παραπάνω) — περιμένοντας ~90s καθαρίστηκε, health OK. Μετά το πραγματικό
`./deploy-update.sh` (detached, `nohup`): build ~255s, `DEPLOYED: bbadfda9 → c58a79a1, healthy`,
`health: OK (attempt 1)`.

**Ανεξάρτητη επαλήθευση**:

| έλεγχος | αποτέλεσμα |
|---|---|
| `GET https://ph-aros.com/` | 200 |
| `GET https://app.ph-aros.com/account/login` | 200 |
| `GET https://app.ph-aros.com/` (χωρίς session) | 307 → login |
| `docker inspect pharos-web` | RestartCount 0, running |

**Δεν δοκιμάστηκε live από εμένα** (login-gated, δεν πληκτρολογώ password): το bulk-edit UI, το
relocated user-menu, και ένα πραγματικό upload για να φανεί το νέο quota στο account/usage —
χρειάζεται ένα πέρασμα του Αχιλλέα.

---

## 2026-08-06 22:2x UTC — `fcb868aa → 332e107a`, exit 0 (interactive session, μετά από μία αποτυχία + rollback)

Όχι το routine `pharos-deploy`, interactive συνεδρία, ρητό αίτημα Αχιλλέα («Deploy») αμέσως μετά
το mobile nav fix. Ακολουθήθηκε το documented flow του `deploy-update.sh` (καμία χειροκίνητη
docker εντολή).

**Πρώτη απόπειρα: exit 2, ΑΠΕΤΥΧΕ και έκανε αυτόματο rollback.** Το build έσπασε στο webpack:

```
Module build failed: UnhandledSchemeError: Reading from "node:fs" is not handled by plugins
./src/lib/saas/f2b.ts -> ./src/components/saas/firewallView.ts -> ./src/components/saas/FirewallPanel.tsx
```

Αιτία: το `06bf44a` έβαλε το `firewallView.ts` να κάνει import το `F2B_JAILS` ως **VALUE** από το
`lib/saas/f2b.ts`, που ανοίγει `node:fs`/`node:path`. Το `firewallView` το εισάγει το
`'use client'` `FirewallPanel`, άρα το client bundle τραβούσε node builtins. **Ο λόγος που δεν το
έπιασε κανείς νωρίτερα**: τα type-only imports τα σβήνει ο tsc, οπότε το `npm run type-check`
έμενε πράσινο και ΜΟΝΟ ο bundler το έβλεπε. Το τοπικό Docker build περνούσε επίσης, γιατί το
working tree είχε ήδη το μισοτελειωμένο fix uncommitted, ενώ ο server χτίζει από το committed main.

Το `deploy-update.sh` έκανε ό,τι έπρεπε: verification failed, **rollback στο `fcb868aa`**, health
OK. **Η παραγωγή ΠΟΤΕ δεν σέρβιρε το σπασμένο build.**

**Fix (`332e107a`)**: split του contract σε `lib/saas/f2b.shared.ts` (constants + types, μηδέν node
imports), το `f2b.ts` τα re-exports ώστε κάθε υπάρχων importer να μείνει ανέπαφος, και τα δύο
client-side αρχεία εισάγουν από το `.shared`. Ίδιο μοτίβο με `notifiers.shared.ts` /
`deliveryLog.shared.ts` / το παλιό `aiFeatures` split. Επαληθεύτηκε με production-parity
`next build` σε καθαρό worktree του main + ΜΟΝΟ αυτά τα 4 αρχεία, πριν γίνει commit.

**Δεύτερη απόπειρα: exit 0**, `DEPLOYED: fcb868aa → 332e107a, healthy` (health OK στη 2η
προσπάθεια, ένα αναμενόμενο 502 όσο σηκωνόταν το container).

**Τι έφυγε (10 commits)**: `2cc1e31` mobile nav fix, `06bf44a`+`ff2e7f7` fail2ban admin console,
`332e107a` το παραπάνω build fix, `24cd2a1`+`7b711cb` tests/log, υπόλοιπα docs.

**Ανεξάρτητη επαλήθευση**:

| έλεγχος | αποτέλεσμα |
|---|---|
| `GET https://ph-aros.com/` | 200 |
| `GET https://app.ph-aros.com/account/login` | 200 |
| `GET https://app.ph-aros.com/` (χωρίς session) | 307 → login |
| `git log -1` στον server | `332e107` |
| `docker inspect` web / caddy / mongo | running, RestartCount 0 |
| `docker logs --since 5m` | καθαρά (μόνο το προϋπάρχον `@napi-rs/canvas` optional-dep warning) |

**Δεν δοκιμάστηκε live από εμένα** (login-gated): το ίδιο το mobile nav fix πάνω στο SaaS και το
`/admin/firewall` panel. Το nav fix επαληθεύτηκε πλήρως τοπικά σε 375px viewport (full
pointerdown/mousedown/mouseup/click sequence → το link επιβιώνει του mousedown και πλοηγεί).

**Μάθημα**: το `npm run type-check` ΔΕΝ πιάνει client/server boundary violations. Μόνο ένα
πραγματικό `next build` τα πιάνει. Αξίζει CI check που τρέχει build, όχι μόνο type-check.

---

## 2026-08-13 08:45 UTC — ΑΠΟΚΛΕΙΣΜΕΝΟ, κανένα deploy. Η παραγωγή είναι υγιής και μένει στο `332e107a`

Routine `pharos-deploy`. **Τίποτα δεν άλλαξε στην παραγωγή.** Δεν πρόκειται για αποτυχία του
`deploy-update.sh`: το script δεν έτρεξε ποτέ, γιατί **δεν υπάρχει πια πρόσβαση SSH στον server
από αυτό το μηχάνημα**.

**Τι απέτυχε, ακριβώς.** Και τα δύο τοπικά κλειδιά απορρίπτονται:

```
ssh -i ~/.ssh/pharos_hetzner root@128.140.126.136  → Permission denied (publickey)
ssh -i ~/.ssh/id_ed25519     root@128.140.126.136  → Permission denied (publickey)
```

Ο agent δεν κρατά καμία ταυτότητα. Άρα τα βήματα 1 ως 3 (τι θα έφευγε, pre-flight, deploy) είναι
αδύνατα, και **δεν έγινε καμία απόπειρα να παρακαμφθεί το script με χειροκίνητες εντολές docker**.
Το αίτιο είναι γνωστό και καταγεγραμμένο: τα κλειδιά του Mac δούλευαν στις 4/8 και έκτοτε έγιναν
rotate στη μεριά του server. Η επαναφορά θέλει προσθήκη δημόσιου κλειδιού από την κονσόλα του
Hetzner, δηλαδή τον ίδιο τον Αχιλλέα.

**Η παραγωγή ελέγχθηκε ανεξάρτητα, από έξω, και είναι εντάξει:**

| έλεγχος | αποτέλεσμα |
|---|---|
| `GET https://ph-aros.com/` | 200, σώμα 369 KB, περιέχει «Self-host», μηδέν πεδίο password |
| `GET https://app.ph-aros.com/account/login` | 200, σώμα 88 KB, με πεδίο password |
| `POST https://app.ph-aros.com/api/cron/saas/trials-sweep` χωρίς token | **401** `{"error":"unauthorized"}` |

Τα δύο πρώτα συγκρίθηκαν ως **σώματα**, όχι ως status ή τίτλος: apex και app είναι διαφορετικά
upstream που και τα δύο απαντούν 200, οπότε ένα routing regression δεν φαίνεται από τον κωδικό.
Εδώ διαφέρουν κατά 280 KB και μόνο το app σερβίρει φόρμα σύνδεσης, άρα η δρομολόγηση είναι σωστή.
Το DNS αναλύθηκε κανονικά, δεν χρειάστηκε `--resolve`.

**Τι μένει στη σειρά:** 55 commits `332e107a..c1ec565`, από τις 6/8 και μετά. Μέσα τους υπάρχει
δουλειά που έχει σημασία, κυρίως οι τρεις παρτίδες της πύλης tenant (`8609dd3`, `12b755b`,
`a3398af`), δηλαδή διορθώσεις απομόνωσης δεδομένων ανά πελάτη. **Δεν μπόρεσα να επιβεβαιώσω με
ποιο commit τρέχει σήμερα ο server** (θέλει SSH), οπότε το `332e107a` είναι το τελευταίο
**καταγεγραμμένο** deploy, όχι μετρημένο.

**Τι έγινε παρ' όλα αυτά:** εφαρμόστηκε η εγκεκριμένη `pharos-deploy-20260807-0312`, το mount
`- ./f2b:/var/lib/pharos/f2b` στο service `web`. Είναι αυτούσια η εντολή του Αχιλλέα, δεν αλλάζει
τίποτα μέχρι να γίνει deploy, και επαληθεύτηκε ότι οι διαδρομές ταιριάζουν: ο `f2b-bridge.sh`
γράφει στο `/opt/pharos/deploy/f2b` και φτιάχνει μόνος του τα `requests/`/`done/`/`rejected/` με
τα σωστά δικαιώματα, ενώ η εφαρμογή διαβάζει `/var/lib/pharos/f2b`. Το compose είναι έγκυρο YAML.

**Τι ΔΕΝ έγινε, σκόπιμα:** η δεύτερη μισή της `pharos-deploy-20260807-1045`, το health check στο
`web` με `depends_on: condition: service_healthy`. Δύο λόγοι, και οι δύο θέλουν run που μπορεί
πράγματι να κάνει deploy. Πρώτον, δεν είναι καθόλου βέβαιο ότι κλείνει το παράθυρο 502: ο caddy
δεν ξαναδημιουργείται στο deploy, μένει ζωντανός όσο επανεκκινεί το `web`, και το `depends_on`
αφορά μόνο τη σειρά εκκίνησης, οπότε τη στιγμή του incident δεν παίζει ρόλο. Η άλλη εγκεκριμένη
εναλλακτική, retry του caddy προς το upstream, μοιάζει να χτυπά το πραγματικό αίτιο. Δεύτερον,
ένα health check που δεν έχει δοκιμαστεί ποτέ ζωντανά μπορεί να μαρκάρει το `web` μόνιμα
unhealthy, και τότε ο caddy δεν ξεκινά καθόλου μετά από reboot. Δεν το γράφω στα τυφλά όταν δεν
μπορώ ούτε να το χτίσω ούτε να το επαληθεύσω.

**Διάρκεια:** περίπου 6 λεπτά, όλα σε διάγνωση και ελέγχους. **Ενέργεια που χρειάζεται από τον
Αχιλλέα:** ξαναβάλε δημόσιο κλειδί στον server ή τρέξε το deploy από περιβάλλον που κρατά δικό
του κλειδί. Μέχρι τότε η παραγωγή τρέχει σωστά, απλώς μένει πίσω.

**ΔΙΟΡΘΩΣΗ, ίδια μέρα 10:00 UTC, αφού ξεκλείδωσε το SSH.** Δύο λάθη στην παραπάνω εγγραφή, και τα
δύο από το ότι έγραφα χωρίς πρόσβαση στον server:

1. **Το αίτιο δεν ήταν rotate κλειδιών.** Και τα δύο τοπικά κλειδιά είναι κλειδωμένα με passphrase
   και ο ssh-agent ήταν άδειος, οπότε με `BatchMode=yes` το ssh δεν πρόσφερε κανένα κλειδί. Μόλις
   φορτώθηκαν στον agent, η σύνδεση δούλεψε. Ενδιάμεσα οι ίδιες μου οι αποτυχημένες προσπάθειες
   ενεργοποίησαν το **fail2ban** και η πόρτα 22 απαντούσε «Connection refused» για μία ώρα, ενώ το
   443 σέρβιρε κανονικά. Δύο διαφορετικά συμπτώματα, ένα τοπικό αίτιο, μηδέν πρόβλημα στον server.

2. **Η παραγωγή ΔΕΝ τρέχει το `332e107a`.** Μετρημένο τώρα: `git rev-parse HEAD` στον server δίνει
   **`e38d8d3`**, της **7ης Αυγούστου**, και είναι **37 commits πίσω** από το `origin/main`, όχι 55.
   Άρα έγιναν deploy μετά τις 6/8 χωρίς να γραφτεί εγγραφή εδώ. Το `pharos-web` τρέχει 6 ημέρες,
   που συμφωνεί. Το «332e107a» ήταν το τελευταίο **καταγεγραμμένο**, και το πήρα για μετρημένο.
   Το ημερολόγιο έχει κενό, δεν το γεμίζω αναδρομικά με εικασίες.

Κατάσταση server: τέσσερα container πάνω, mongo healthy, δίσκος 55%, δέντρο καθαρό, backup της
03:20 σήμερα παρόν. **Δεν έγινε deploy**, κατ' εντολή του Αχιλλέα: το cloud αποσύρεται και τα 37
commits θα πάνε κατευθείαν στο νέο host. Βλ. `MIGRATION_PROXMOX.md`.

---

## 2026-08-28 02:10 UTC · ΜΠΛΟΚΑΡΙΣΜΕΝΟ, κανένα deploy · exit code: κανένας (το script δεν έτρεξε ποτέ)

**Δεν έγινε deploy και δεν άλλαξε τίποτα στην παραγωγή.** Το routine σταμάτησε πριν το STEP 1,
για δύο ανεξάρτητους λόγους. Η παραγωγή είναι υγιής, επαληθευμένη από έξω.

**1. Το routine εκτελέστηκε αυτόματα, ενώ εξ ορισμού δεν έχει schedule.** Το ίδιο του το SKILL.md
το λέει ρητά: «You have NO SCHEDULE, and that is the design... If you ever find yourself firing
automatically, something has been misconfigured, stop and say so.» Αυτό ακριβώς συνέβη, οπότε το
αναφέρω αντί να προχωρήσω. Τα features του Pharos δοκιμάζονται πρώτα τοπικά με τα δεδομένα του
Αχιλλέα, και μόνο αφού τα δει πάνε στην παραγωγή, άρα ένα αυτόματο deploy παρακάμπτει ολόκληρη τη
λογική της ροής.

**2. Ο στόχος του SKILL.md είναι ξεπερασμένος και, το χειρότερο, ΕΠΙΚΙΝΔΥΝΟΣ.** Η μετακόμιση σε
Proxmox ολοκληρώθηκε (commit `3cc19ab`, `OWNER_DECISIONS.md` και `MIGRATION_PROXMOX.md`), η
παραγωγή τρέχει στο apps VM `10.0.1.11` και το Hetzner `128.140.126.136` τερματίστηκε. Το SKILL.md
όμως δεν ενημερώθηκε ποτέ και εξακολουθεί να λέει `ssh pharos`, ενώ το `~/.ssh/config` χαρτογραφεί
το `pharos` στο παλιό `128.140.126.136`.

**Και εκεί είναι το σοβαρό εύρημα:** το `ssh pharos` απαντά τώρα με **αλλαγμένο host key**
(`REMOTE HOST IDENTIFICATION HAS CHANGED`, νέο ED25519
`SHA256:Dw8pac/NDbs4fcwEsO4XqycdbB3w/3mEG5UL7rkJhB8`, παλιό ECDSA στη γραμμή 6 του `known_hosts`).
Δηλαδή το Hetzner ανακύκλωσε τη διεύθυνση και εκεί κάθεται πλέον **ξένο μηχάνημα**. Ο αυστηρός
έλεγχος κλειδιού το έκοψε, όπως έπρεπε. Αν κάποιος παρακάμψει τον έλεγχο για να «ξεμπλοκάρει» το
deploy, στέλνει repo, `.env.prod` και εντολές docker σε μηχάνημα τρίτου. Να μη γίνει.

**Ο νέος host είναι προσβάσιμος.** Ο Mac είναι στο ίδιο LAN (`10.0.1.9`), η πόρτα 22 του
`10.0.1.11` ανοιχτή, υπάρχουν ήδη εγγραφές στο `known_hosts` και ο ssh-agent κρατά κλειδί. Λείπει
μόνο το alias. Το STEP 1 (τι θα έφευγε) δεν μπόρεσε να τρέξει, άρα **δεν ξέρω σε ποιο commit είναι
σήμερα ο server**, ούτε πόσα commits μένουν πίσω. Δεν το μαντεύω. Το τοπικό `main` και το
`origin/main` είναι συγχρονισμένα στο `3cc19ab`, δέντρο καθαρό.

**STEP 2 και STEP 3 δεν έτρεξαν, σκόπιμα.** Χωρίς σωστό στόχο δεν υπάρχει pre-flight να γίνει, και
δεν παρακάμπτω το `deploy/deploy-update.sh` με χειροκίνητα docker: η σειρά health, backup, record,
pull ΕΙΝΑΙ η ασφάλεια.

**STEP 4, ανεξάρτητος έλεγχος υγείας μέσω Cloudflare Tunnel, όλα πέρασαν:**

- `https://ph-aros.com/` → **200**, σώμα 388518 bytes, περιέχει `Self-host`. Συγκρίθηκε το σώμα,
  όχι ο τίτλος, ώστε να πιαστεί τυχόν routing regression ανάμεσα στα δύο upstream.
- `https://app.ph-aros.com/account/login` → **200**, σώμα 89024 bytes, σαφώς διαφορετικό από το
  landing.
- `POST https://app.ph-aros.com/api/cron/saas/trials-sweep` χωρίς token → **401**
  `{"error":"unauthorized"}`. POST, όχι GET, γιατί το route εξάγει μόνο `POST`.

Καμία παράκαμψη DNS, τα ονόματα λύθηκαν κανονικά.

**Τι χρειάζεται από τον Αχιλλέα, με σειρά προτεραιότητας:**

1. Καθάρισε τη γραμμή 6 του `~/.ssh/known_hosts` και δείξε το alias `pharos` στο `10.0.1.11`. Όσο
   το alias δείχνει σε ανακυκλωμένη IP, κάθε routine που λέει «ssh pharos» είναι παγίδα.
2. Ενημέρωσε το `pharos-deploy/SKILL.md`: νέος host, νέο μονοπάτι, βγάλε το «DISABLED until the
   new VM is up» και πρόσθεσε τον exit code `4` (lock held) που ήδη υπάρχει στο script.
3. Το ίδιο πρόβλημα έχει και το `pharos-cloud-guard/SKILL.md`, που δείχνει επίσης στο παλιό IP.
4. Βγάλε το schedule από το `pharos-deploy`. Δεν πρέπει να έχει.

**Διάρκεια:** περίπου 4 λεπτά, όλα σε διάγνωση και ελέγχους υγείας.

### Συνέχεια, ίδια μέρα, κατ' εντολή του Αχιλλέα: το alias διορθώθηκε

**Έγιναν:** το alias `pharos` στο `~/.ssh/config` δείχνει πλέον στο `10.0.1.11` (κρατήθηκε αντίγραφο
στο `config.bak-20260828`), και ενημερώθηκαν τα `pharos-deploy/SKILL.md` και
`pharos-cloud-guard/SKILL.md`. Δεν έγινε deploy.

**Ο χρήστης ΔΕΝ είναι ο `root`.** Το cloud-init της VM απαντά `Please login as the user "ubuntu"`,
οπότε το alias λέει `User ubuntu`. Ο `ubuntu` είναι στα groups `docker` και `sudo`, άρα το script
δεν θέλει sudo. Η σύνδεση επαληθεύτηκε: hostname `apps`, repo στο `/opt/pharos`.

**Η VM είναι ΚΟΙΝΗ, δεν είναι μηχάνημα μόνο του Pharos.** Πάνω της τρέχουν η παραγωγή
(`pharos-web`, `pharos-mongo`, `pharos-landing`), η ΤΟΠΙΚΗ εγκατάσταση (`pharos-local-*`), ολόκληρο
το BakeCore, και homelab (portainer, netdata, uptime-kuma, dozzle, ntfy, wud, homelable, homepage).
Ένα `docker system prune` εδώ ρίχνει και την παραγωγή του BakeCore. Μπήκε ρητή προειδοποίηση και
στα δύο SKILL.

**Η παραγωγή είναι 4 commits πίσω:** ο server είναι στο `0bb2c65`, το `origin/main` στο `eead779`
(`fed03bb`, `3fe399b`, `3cc19ab`, `eead779`).

**Δύο μπλοκαρίσματα, μετρημένα, και τα δύο ανοιχτά:**

1. **Το `--check` γυρίζει 1 ενώ η παραγωγή είναι όντως υγιής.** Η `health()` στο
   `deploy-update.sh` ελέγχει ακόμα container με όνομα `pharos-caddy`, που **δεν υπάρχει πια**:
   μετά τη μετακόμιση όλα περνούν από έναν κοινό `caddy` (`caddy-cf:local`) και τον `cloudflared`.
   Όλοι οι υπόλοιποι έλεγχοι περνούν. Άρα το STEP 2 αποτυγχάνει και το STEP 3 αρνείται με exit 1,
   με μήνυμα «production is already unhealthy» που είναι ψευδής συναγερμός.
2. **Το δέντρο στον server είναι βρόμικο, περίπου 1300 untracked.** Σχεδόν όλα είναι AppleDouble
   `._*` του macOS από αντιγραφή, συν ένα `.vite/`. Το script αρνείται σε βρόμικο δέντρο εκ
   σχεδιασμού, γιατί το rollback θα τα έσβηνε.

Καμία από τις δύο δεν τη διόρθωσα: η πρώτη θέλει αλλαγή στο `deploy-update.sh`, η δεύτερη σβήσιμο
αρχείων στον server, και καμία δεν ζητήθηκε. Μέχρι να λυθούν, **κανένα deploy δεν μπορεί να τρέξει**.

## 2026-08-28 09:40 — απόπειρα deploy κατ' εντολή του Αχιλλέα: ΜΠΛΟΚΑΡΙΣΤΗΚΕ στο backup (exit 1)

**Η παραγωγή δεν άλλαξε καθόλου.** Τα containers είναι ακόμα στο `0bb2c65` (Up 43 ώρες) και υγιή.
Ανεξάρτητος έλεγχος μετά την απόπειρα: `ph-aros.com/` **200** (388518 bytes, περιέχει self-host),
`app.ph-aros.com/account/login` **200** (89024 bytes, σαφώς άλλο σώμα), `POST .../trials-sweep`
χωρίς token **401**.

**Τα δύο γνωστά blockers του log της 28/8 ΕΚΛΕΙΣΑΝ** (commit `232084f`):

1. Η `health()` δεν ψάχνει πλέον `pharos-caddy` (πέθανε στη μετακόμιση, τώρα ελέγχονται μόνο τα
   `pharos-web`/`pharos-landing` που ανήκουν σε αυτό το stack· την άκρη την αποδεικνύουν ήδη τα
   τρία δημόσια probes). Το `--check` γυρίζει **0** με την πρώτη προσπάθεια.
2. Ο έλεγχος βρόμικου δέντρου κοιτά πλέον **μόνο tracked** αλλαγές. Τα 1302 untracked (AppleDouble
   `._*` + `.vite/`) δεν κινδύνεψαν ποτέ: ούτε το `git merge --ff-only` ούτε το `git checkout` του
   rollback τα αγγίζει. Τώρα απλώς αναφέρονται ως σημείωση.

**ΤΡΙΤΟ blocker που δεν ήταν καταγεγραμμένο, και ήταν το επικίνδυνο.** Το
`docker-compose.prod.yml` όριζε ακόμα υπηρεσία `caddy` (`container_name: pharos-caddy`) που δεσμεύει
`80:80` και `443:443` — τις θύρες που κρατά ο **κοινός** `caddy`, αυτός που σερβίρει και το
bakecore.gr και το homelab. Και ο script πρόσθετε το `caddy` στα services προς rebuild όποτε άλλαζε
οτιδήποτε μέσα στο `deploy/`, δηλαδή ακριβώς όταν διορθώνεις τα blockers 1 και 2. Μπήκε
`profiles: ["standalone"]` (η υπηρεσία μένει για standalone host, δεν ξεκινά ποτέ από σκέτο
`up -d`) και το mapping στένεψε στο ίδιο το compose αρχείο. Απόφαση Αχιλλέα, ρωτήθηκε.

**ΤΕΤΑΡΤΟ blocker: ο `ubuntu` δεν μπορεί να κάνει `git fetch`.** Το alias `gh-pharos` και το κλειδί
ζουν στο `/root/.ssh/config`, ο `ubuntu` δεν έχει ούτε config ούτε κλειδί, και το HTTPS remote
`github` ζητά credentials που δεν υπάρχουν. Παρακάμφθηκε **για αυτή τη φορά μόνο**, κατ' εντολή
Αχιλλέα: `sudo git fetch origin` και μετά `chown -R ubuntu:ubuntu /opt/pharos/.git`. Κανένα κλειδί
δεν διαβάστηκε ούτε μετακινήθηκε. **Θα ξαναχρειαστεί σε κάθε deploy μέχρι ο `ubuntu` αποκτήσει δικό
του read-only deploy key.**

**ΠΕΜΠΤΟ blocker, εδώ σταμάτησε, και ο script έκανε το σωστό.** Το `backup.sh` πέρασε το dump
(έγκυρο gzip, πέρασε και το dry-run restore) αλλά **απέτυχε στο offsite αντίγραφο**, οπότε αρνήθηκε
να προχωρήσει: «the local copy exists but is not protected». Δύο ανεξάρτητοι λόγοι:

- Το `u645343.your-storagebox.de` **δεν αναλύεται καθόλου** (το γενικό DNS της VM δουλεύει, το
  github.com λύνεται κανονικά). Το Hetzner Storage Box φαίνεται να έφυγε μαζί με το VPS.
- Το κλειδί `/root/.ssh/storagebox` **δεν υπάρχει** στη VM (ούτε με sudo). Δεν μεταφέρθηκε ποτέ.

Δηλαδή **κανένα offsite backup δεν έχει φύγει από το νέο σπίτι**, ποτέ. Αυτό ήταν ήδη ανοιχτό
σημείο στο `MIGRATION_PROXMOX.md` (γρ. 241, «ένα backup που δεν έχει φτάσει ποτέ offsite από το
καινούργιο σπίτι δεν μετράει») και τώρα επιβεβαιώθηκε ως πραγματικό κενό, όχι υποψία.

**Παρατήρηση για τα μεγέθη:** το τοπικό dump είναι `mongo-...archive.gz` **5936 bytes** και
`storage-...tar.gz` **115 bytes**. Είναι έγκυρα (πέρασαν την επαλήθευση), απλώς η βάση της
παραγωγής είναι ουσιαστικά **άδεια** και ο φάκελος storage κενός, που ταιριάζει με το ότι το
dogfooding γίνεται στο `pharos-local-*` και η παραγωγή δεν έχει ακόμα πραγματικούς χρήστες. Καλό
να το ξέρουμε πριν εκτιμήσουμε το ρίσκο.

**Τι λείπει για να τρέξει το deploy** (και τα δύο θέλουν τον Αχιλλέα):

1. **Offsite προορισμός.** Είτε νέος (`BACKUP_SSH` + κλειδί προσβάσιμο από τον `ubuntu`), είτε ρητή
   απόφαση να τρέξει το backup τοπικά μόνο. Το δεύτερο σημαίνει άγγιγμα του `.env.prod`, που είναι
   HARD RULE για αυτό το routine, οπότε δεν το κάνω μόνος μου.
2. **Read-only deploy key για τον `ubuntu`**, ώστε να πάψει η παράκαμψη με sudo.

**Κατάσταση δέντρου στον server:** `HEAD=232084f`, stamp `deploy/.deployed=0bb2c65`. Το stamp
γράφτηκε επίτηδες ΠΡΙΝ το fast-forward ώστε το rollback να ξέρει τι τρέχει όντως στα containers.
Άρα η επόμενη απόπειρα θα στείλει σωστά το `0bb2c65..origin/main` και θα γυρίσει σωστά πίσω.

**Διάρκεια:** περίπου 25 λεπτά, κυρίως διάγνωση.

## 2026-08-28 10:15 — DEPLOY ΕΠΙΤΥΧΕΣ: `0bb2c65` → `232084f` (exit 0)

Δεύτερη απόπειρα της ίδιας μέρας, μετά το ξεμπλοκάρισμα των πέντε εμποδίων της προηγούμενης
εγγραφής. **11 commits** στην παραγωγή:

```
232084f fix(deploy): unblock the pipeline after the Proxmox move, stop pharos-caddy fighting the shared proxy
394beca feat(bills,expenses): every-2-years cycle here too, on the shared table
01fc2e4 fix(receipts): make search find Greek text, and give the list filters worth using
cc65ed3 feat(subscriptions): add an every-2-years billing cycle, from one shared cycle table
056623c docs(deploy): retarget routines to the Proxmox VM
93af6f8 docs(progress): log P64 φάση 1
c11692b feat(receipts): per-line spend category (P64 φάση 1)
eead779 docs(deploy): log blocked run
3cc19ab docs(infra): record current Proxmox/GitHub deploy
3fe399b docs(progress): log P62
fed03bb feat(expenses): split one purchase across several payment methods (P62)
```

**Διόρθωση σε προηγούμενη μέτρηση:** είχε ειπωθεί «51 commits πίσω». Αυτό ήταν μετρημένο από το
`e38d8d3`, το τελευταίο **Hetzner** deployed sha αυτού του log. Το πραγματικό checkout του server
ήταν ήδη στο `0bb2c65`, άρα το αληθινό κενό ήταν **11 commits**, όπως το ανέφερε και η εγγραφή της
28/8. Το `e38d8d3` δεν είναι πλέον χρήσιμο σημείο αναφοράς μετά τη μετακόμιση.

**Ροή του script:** pre-flight health OK (πρώτη προσπάθεια) · σημείωση για 1303 untracked, αφέθηκαν
ως έχουν · backup ok · currently deployed `0bb2c657` (από το stamp που είχε γραφτεί χειροκίνητα) ·
shipping 11 · rebuilding **landing web** (ο `pharos-caddy` ΔΕΝ μπήκε, το profile gate δούλεψε) ·
verifying → health OK (δεύτερη προσπάθεια) · `DEPLOYED: 0bb2c657 → 232084f3, healthy`.

**Ανεξάρτητος έλεγχος, μετά το deploy:** `ph-aros.com/` **200** (388518 bytes, περιέχει self-host,
ίδιο μέγεθος με πριν όπως αναμενόταν, το landing δεν άλλαξε) · `app.ph-aros.com/account/login`
**200** και **90103 bytes**, από 89024 πριν, δηλαδή σερβίρεται όντως το νέο build ·
`POST /api/cron/saas/trials-sweep` χωρίς token **401**.

### ΤΟ BACKUP ΤΡΕΧΕΙ ΤΟΠΙΚΑ ΜΟΝΟ, ΜΕ ΡΗΤΗ ΕΓΚΡΙΣΗ

Το offsite σκέλος απενεργοποιήθηκε για να ξεμπλοκάρει το deploy, κατ' εντολή του Αχιλλέα. Στο
`deploy/.env.prod` η γραμμή `BACKUP_SSH=` σχολιάστηκε (αντίγραφο στο `.env.prod.bak-20260828`,
δεν τυπώθηκε ποτέ περιεχόμενο). Το `backup.sh` πλέον τυπώνει τη δυνατή προειδοποίηση
«No offsite target: these files are on the SAME DISK as the data they protect» και συνεχίζει.

**Αυτό είναι προσωρινή κατάσταση, όχι λύση.** Μέχρι να μπει προορισμός, ένα χάλασμα δίσκου ή ένα
λάθος `docker volume rm` παίρνει και τα δεδομένα και τα αντίγραφα. Μετριάζεται σήμερα από το ότι η
παραγωγική βάση είναι ουσιαστικά άδεια (dump ~6 KB, storage 115 bytes).

**Η δουλειά για το NAS ξεκίνησε αλλά ΔΕΝ ολοκληρώθηκε:**

- Στόχος: DS923+ στο **10.0.1.5** (από το homelab inventory). Ping OK, αλλά **SSH κλειστό** σε 22,
  2222, 31022 και rsync daemon κλειστός στο 873. Ανοιχτά μόνο τα DSM 31000/31001. Το SSH service
  θέλει ενεργοποίηση στο DSM.
- Φτιάχτηκε ζεύγος κλειδιών στη VM: `~ubuntu/.ssh/nas-backup` (ed25519, χωρίς passphrase γιατί το
  τρέχει cron). Το ιδιωτικό δεν διαβάστηκε ποτέ. Δημόσιο:
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO9KWLOhNFewHC8+BwR+y3m/Dwha2hERZ2IfGMCtx+f8 pharos-backup@apps`
- **Ο Αχιλλέας δεν θέλει home directory** για τον χρήστη `backups`, άρα ο δρόμος του
  `~/.ssh/authorized_keys` είναι κλειστός. Εναλλακτικές: rsync daemon στο DSM (θύρα 873, δικό του
  secrets file, μηδέν home) ή rclone προς SMB/WebDAV μέσω `BACKUP_REMOTE` (το script το υποστηρίζει,
  θέλει εγκατάσταση rclone στη VM).
- **Σημείωση τοποθεσίας:** το DS923+ είναι στο ίδιο LAN με τη VM (10.0.1.5 vs 10.0.1.11). Είναι
  δεύτερο αντίγραφο, όχι πραγματικά offsite. Το **DS223** (10.0.10.5) είναι ήδη σημειωμένο στο
  inventory ως «offsite backup target».

**Παραμένει ανοιχτό:** ο `ubuntu` ακόμα δεν έχει δικό του deploy key, οπότε το `git fetch` έγινε με
`sudo` και μετά `chown -R ubuntu:ubuntu /opt/pharos/.git`. Θα χρειάζεται σε κάθε deploy μέχρι να
μπει κλειδί.

**Διάρκεια:** περίπου 12 λεπτά, τα 7 σε build (Next compile 3.6 λεπτά σε δύο πυρήνες).

## 2026-08-28 12:05 — self-hosted ενημερώθηκε, και το backup προστάτευε λάθος βάση

**Το self-hosted (`pharos-local-web`) τρέχει πλέον τον ίδιο νέο κώδικα.** Δεν χρειάστηκε build:
το `/opt/pharos-local` **δεν είναι git repo**, είναι ένα `docker-compose.yml` που δείχνει στο tag
`pharos-web:prod` — το ΙΔΙΟ tag που χτίζει το deploy της παραγωγής. Μετά το deploy των 10:15 το tag
έδειχνε ήδη στο `3192bdd2`, ενώ το container έτρεχε ακόμα το παλιό `ee31c58d`, οπότε αρκούσε
`docker compose up -d --force-recreate web`. Τώρα και τα δύο containers τρέχουν το `3192bdd2`,
RestartCount 0, `Ready in 455ms`, HTTP 200. Τα δεδομένα δεν αγγίχτηκαν (η mongo είναι σε δικό της
volume, το storage είναι bind mount).

**Παρενέργεια που αξίζει να ξέρουμε:** επειδή μοιράζονται tag, **κάθε** deploy παραγωγής ετοιμάζει
σιωπηλά νέο image και για το self-hosted, το οποίο θα το πάρει στο επόμενο restart όποτε κι αν
συμβεί αυτό. Δεν είναι κακό, αλλά είναι έκπληξη αν δεν το περιμένεις.

### ΤΟ ΒΑΣΙΚΟ ΕΥΡΗΜΑ: το nightly backup προστάτευε την άδεια εγκατάσταση

Το `backup.sh` είχε καρφωμένο `docker exec pharos-mongo` και `deploy/storage`, δηλαδή τη
**φιλοξενούμενη** στοίβα. Σε αυτό το μηχάνημα αυτό σημαίνει:

| | παραγωγή (`pharos-mongo`) | self-hosted (`pharos-local-mongo`) |
|---|---|---|
| dump | **6 KB** | **108 KB** (119 αποδείξεις, 96 αντικείμενα, 95 καταστήματα, 11 συνδρομές) |
| storage | **4 KB**, κενό | **215 MB**, 821 entries |
| στο backup.sh | ναι | **καμία αναφορά** |

Δηλαδή αντιγραφόταν κάθε βράδυ το άδειο και δεν αντιγραφόταν ποτέ το γεμάτο. Και επιπλέον
**δεν υπήρχε καν cron** για backup στη VM (μόνο το acme.sh), οπότε ούτε το άδειο δεν έτρεχε
προγραμματισμένα.

**Διόρθωση (commit `edf4651`):** τέσσερα πράγματα έγιναν overridable, με το ίδιο ιδίωμα
`MONGO_CONTAINER` που είχε ήδη το `restore.sh` — `ENV_FILE`, `MONGO_CONTAINER`, `STORAGE_DIR`,
`BACKUP_LABEL`. Το `ENV_FILE` μετράει περισσότερο απ' όσο φαίνεται: το script κάνει source με
`set -a`, οπότε ένα `MONGO_PASSWORD` περασμένο στη γραμμή εντολών **αντικαθιστούνταν** από την τιμή
της φιλοξενούμενης στοίβας πριν καν χρησιμοποιηθεί. Το `restore.sh` πήρε `STORAGE_PARENT` για
συμμετρία.

**Λανθάνον bug που βγήκε στην πορεία:** το offsite prune έβγαζε την ημερομηνία αφαιρώντας ένα
`[a-z]+-` prefix, που μετατρέπει το `mongo-local-20260828-..` σε `local` — string που συγκρίνεται
μεγαλύτερο από κάθε cutoff, άρα τα labelled αρχεία **δεν θα καθαρίζονταν ποτέ** και ο απομακρυσμένος
χώρος θα γέμιζε σιωπηλά. Τώρα κάνει match στο ίδιο το timestamp.

**Επαληθεύτηκε και στα δύο:** το labelled run πέρασε dump, gzip check και **dry-run restore**·
το προεπιλεγμένο run βγάζει ονόματα byte-identical με πριν (`mongo-20260828-085850.archive.gz`)·
το `storage-local` archive ανοίγει καθαρά με σωστό `storage/` prefix, 821 entries, `gzip -t` OK.

**Cron που μπήκε** (διατηρήθηκε το υπάρχον acme.sh):

```
20 3 * * *  παραγωγή, KEEP_DAYS default 14
40 3 * * *  self-hosted, BACKUP_LABEL=local BACKUP_KEEP_DAYS=7
```

Οι 7 μέρες για το self-hosted είναι σκόπιμες: 215 MB ανά βράδυ, και ο δίσκος (38 GB, 12 GB
ελεύθερα) είναι κοινός με το BakeCore. 7×215 MB ≈ 1,5 GB.

**ΠΑΡΑΜΕΝΕΙ ΑΝΟΙΧΤΟ:** το offsite είναι ακόμα απενεργοποιημένο, άρα και τα δύο αντίγραφα κάθονται
**στον ίδιο δίσκο με τα δεδομένα**. Αυτό είναι πλέον το σοβαρότερο ανοιχτό σημείο, γιατί τώρα
προστατεύονται πραγματικά δεδομένα. Επόμενο βήμα: rsync daemon στο DSM (χωρίς home directory) ή
rclone προς SMB. Επίσης το `/home/ubuntu/pharos-backup.log` δεν έχει rotation.
