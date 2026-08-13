# Μετακόμιση από Hetzner cloud σε self-hosted Proxmox

Runbook για τη μεταφορά του Pharos από το `128.140.126.136` σε δική μας Ubuntu VM πάνω σε
Proxmox, με έκθεση μέσω Cloudflare Tunnel. Ίδια domains, ώστε DNS, health checks και τα URL των
routines να μείνουν σταθερά.

**Η σειρά είναι το ουσιώδες.** Το τελευταίο βήμα, ο τερματισμός του Hetzner, είναι μη
αναστρέψιμο και έρχεται μόνο αφού το καινούργιο σερβίρει επαληθευμένα.

Απόφαση: `OWNER_DECISIONS.md`, «TASK (owner-driven) 2026-08». Τι υπάρχει σήμερα στην παραγωγή:
`DEPLOY_LOG.md` και `CLOUD_GUARD.md`.

---

## Φάση 0. Διάσωση, πριν σβήσεις οτιδήποτε

Ο server έχει **ένα** πράγμα που δεν υπάρχει πουθενά αλλού.

| τι | πού είναι | χρειάζεται διάσωση |
|---|---|---|
| Mongo, όλες οι βάσεις | offsite στο Storage Box, ημερήσιο | όχι, αλλά πάρε φρέσκο |
| `deploy/storage` (αποδείξεις, statements, φωτογραφίες) | offsite, ίδιο ζεύγος | όχι, αλλά πάρε φρέσκο |
| **`deploy/.env.prod`** | **μόνο εκεί, mode 600** | **ΝΑΙ, πρώτο πράγμα** |
| Caddy certs, f2b state, build cache | ξαναφτιάχνονται | όχι |

```bash
# 1. Τα μυστικά. Χωρίς αυτό, restore σημαίνει καινούργια secrets παντού.
scp pharos:/opt/pharos/deploy/.env.prod ~/Backups/pharos-secrets/.env.prod
chmod 600 ~/Backups/pharos-secrets/.env.prod

# 2. Φρέσκο backup, χειροκίνητα, την ημέρα της μετακόμισης.
ssh pharos 'cd /opt/pharos && ./deploy/backup.sh'

# 3. Κατέβασέ το ΤΟΠΙΚΑ. Το Storage Box είναι ένα αντίγραφο, όχι δύο.
ssh pharos 'ls -t /opt/pharos/deploy/backups/*.gz | head -2'
scp pharos:/opt/pharos/deploy/backups/mongo-<STAMP>.archive.gz   ~/Backups/pharos-migration/
scp pharos:/opt/pharos/deploy/backups/storage-<STAMP>.tar.gz     ~/Backups/pharos-migration/
```

**Δοκίμασε την πρόσβαση στο Storage Box ΑΝΕΞΑΡΤΗΤΑ από τον server**, όσο ο server ζει ακόμα. Το
κλειδί που το ανοίγει κάθεται πάνω του (`BACKUP_SSH_KEY` στο `.env.prod`). Επιβιώνει της
διαγραφής του VPS, αλλά η πρόσβαση θέλει είτε αντίγραφο του κλειδιού είτε reset password από το
Hetzner Robot. Αυτό δοκιμάζεται **πριν**, όχι μετά.

---

## Φάση 1. Η VM

Σημερινό μηχάνημα: 2 vCPU, 3,8 GB RAM με 4 GB swap, 38 GB δίσκος στο 54%. Ο περιοριστής είναι το
**build**: `web` και `landing` χτίζονται παράλληλα με `NODE_BUILD_MEMORY: "3072"` το καθένα,
δηλαδή δυνητική κορυφή 6 GB πάνω σε 3,8 GB πραγματικής μνήμης.

Πρόταση για τη VM: **4 vCPU, 8 GB RAM, 60 GB δίσκος**, Ubuntu Server 24.04 LTS. Δίνει στο build
αέρα ώστε να μη σέρνεται στο swap, και ο δίσκος αντέχει το build cache (φτάνει τα 11 GB πριν το
κλάδεμα) χωρίς να αγγίζει το κατώφλι.

- Δίσκος VM σε SSD storage, όχι σε spinning, η Mongo το αισθάνεται.
- Στατική IP στο LAN, ώστε να μη χαθεί ο tunnel σε reboot του router.
- QEMU guest agent, για σωστά snapshots από το Proxmox.
- **Πάρε snapshot της VM μόλις στηθεί καθαρή**, πριν το restore. Αν κάτι πάει στραβά, γυρνάς σε
  δευτερόλεπτα αντί να ξαναστήνεις.

---

## Φάση 2. Λογισμικό, repo, μυστικά

```bash
apt update && apt install -y docker.io docker-compose-v2 git ufw fail2ban
systemctl enable --now docker

git clone git@github.com:achilleasgkekas/pharos.git /opt/pharos
cd /opt/pharos
```

Το repo είναι private, οπότε ο server θέλει **read-only deploy key** φτιαγμένο πάνω στη VM, όχι
αντίγραφο προσωπικού κλειδιού.

Βάλε το `.env.prod` στο `/opt/pharos/deploy/.env.prod`, **mode 600**. Δεν μπαίνει ΠΟΤΕ στο git.
Τι αλλάζει μέσα του:

- `BACKUP_SSH` / `BACKUP_SSH_KEY`: το Storage Box δουλεύει και από το σπίτι, κράτησέ το. Το
  κλειδί θέλει αντιγραφή στη VM.
- `CF_API_TOKEN`: χρειάζεται μόνο αν κρατήσεις το DNS-01 του Caddy (βλ. Φάση 4).
- Όλα τα υπόλοιπα μένουν αυτούσια. Ειδικά το `AUTH_SECRET` **δεν αλλάζει**, αλλιώς ακυρώνονται
  όλες οι υπάρχουσες συνεδρίες, και το `MONGO_PASSWORD` πρέπει να ταιριάζει με αυτό που θα
  αρχικοποιήσει τη νέα Mongo.

---

## Φάση 3. Restore

**Πρώτα μόνο η Mongo**, μετά το restore, μετά τα υπόλοιπα. Αν σηκώσεις όλο το stack πρώτο, η
εφαρμογή γράφει σε άδεια βάση όσο εσύ κάνεις restore από πάνω της.

```bash
cd /opt/pharos/deploy
docker compose -f docker-compose.prod.yml up -d mongo
# περίμενε να γίνει healthy
docker compose -f docker-compose.prod.yml ps mongo

./restore.sh backups/mongo-<STAMP>.archive.gz backups/storage-<STAMP>.tar.gz
```

Τι πρέπει να ξέρεις για το `restore.sh`:

- Είναι **διαδραστικό**, ζητά να πληκτρολογήσεις το όνομα του container για επιβεβαίωση. Δεν
  τρέχει σε script χωρίς TTY.
- Κάνει `--drop`. Σε καινούργια, άδεια βάση αυτό είναι ακίνδυνο, είναι ακριβώς η περίπτωσή μας.
- Εξαιρεί `admin.*` και `config.*` σκόπιμα. Χωρίς αυτό, το restore αντικαθιστά τον κατάλογο
  χρηστών στη μέση του stream, ακυρώνει τη δική του σύνδεση, και αφήνει βάση **χωρίς indexes**
  ενώ αναφέρει επιτυχία. Ελέγχει μόνο του ότι τα indexes γύρισαν.
- Το `storage-*.tar.gz` ξεπακετάρεται δίπλα στο compose, εκεί που δείχνει το bind mount.

Μετά:

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Ο πρώτος χτίσιμο θέλει λεπτά. Επαλήθευσε **από μέσα**, πριν καν μπει DNS στη μέση:

```bash
curl -sI -H 'Host: app.ph-aros.com' http://localhost/account/login | head -1
curl -sI -H 'Host: ph-aros.com'     http://localhost/            | head -1
```

---

## Φάση 4. Έκθεση με Cloudflare Tunnel

Ο tunnel βγάζει τη VM στο internet **χωρίς public IP και χωρίς ανοιχτές πόρτες** στο router.

Το κρίσιμο σημείο είναι τα workspace subdomains: `<slug>.ph-aros.com`. Επιβεβαιωμένο από την
τεκμηρίωση της Cloudflare, «customers on all plans can create and proxy wildcard DNS records»,
οπότε ένα wildcard public hostname στον tunnel αρκεί και **δεν** θέλει Enterprise, όπως ίσχυε
παλιότερα.

```bash
cloudflared tunnel login
cloudflared tunnel create pharos
cloudflared tunnel route dns pharos ph-aros.com
cloudflared tunnel route dns pharos www.ph-aros.com
cloudflared tunnel route dns pharos app.ph-aros.com
# το wildcard μπαίνει χειροκίνητα ως proxied CNAME *.ph-aros.com -> <UUID>.cfargotunnel.com
```

Ingress (ένα hostname ανά γραμμή, το wildcard τελευταίο ώστε να μην κλέβει τα ειδικά):

```yaml
ingress:
  - hostname: ph-aros.com
    service: http://localhost:80
  - hostname: www.ph-aros.com
    service: http://localhost:80
  - hostname: app.ph-aros.com
    service: http://localhost:80
  - hostname: "*.ph-aros.com"
    service: http://localhost:80
  - service: http_status:404
```

**Απόφαση που πρέπει να πάρεις εδώ: τι κάνει το TLS.** Σήμερα ο Caddy βγάζει wildcard
πιστοποιητικό μόνος του με ACME DNS-01 μέσω Cloudflare. Πίσω από tunnel, το TLS τερματίζει στο
edge της Cloudflare.

- **Προτεινόμενο**: ο Caddy σερβίρει σκέτο HTTP εσωτερικά, ο tunnel μιλά `http://localhost:80`.
  Φεύγει το `CF_API_TOKEN` από τον server, φεύγει η ανανέωση πιστοποιητικών, μένει ο Caddy για
  δρομολόγηση, συμπίεση και το `max_size 100MB` των uploads. Θέλει τα site addresses του
  `Caddyfile` με πρόθεμα `http://` και το `import pharos_tls` έξω.
- **Εναλλακτικά**: μένει ο Caddy με TLS όπως είναι και ο tunnel δείχνει `https://localhost:443`.
  Μηδέν αλλαγή config, ένα περιττό στρώμα κρυπτογράφησης στο loopback.

Ό,τι κι αν διαλέξεις, **ο Host header πρέπει να φτάνει ανέπαφος** στο `web`. Όλη η
πολυ-πελατειακή δρομολόγηση κρέμεται από αυτό: το middleware βγάζει το workspace από το Host.
Αν χαθεί, **κάθε** workspace γίνεται «no tenant» σιωπηλά.

---

## Φάση 5. Ό,τι δεν είναι στο compose

Αυτά ζουν στον host και ξεχνιούνται εύκολα, γιατί κανένα δεν είναι container.

```cron
* * * * *   /opt/pharos/deploy/f2b-bridge.sh
20 3 * * *  /opt/pharos/deploy/backup.sh                     >> /var/log/pharos-backup.log 2>&1
17 4 * * *  /opt/pharos/deploy/cron-call.sh usage-sample     >> /var/log/pharos-cron.log 2>&1
27 4 * * *  /opt/pharos/deploy/cron-call.sh trials-sweep     >> /var/log/pharos-cron.log 2>&1
32 4 * * *  /opt/pharos/deploy/cron-call.sh suspended-sweep  >> /var/log/pharos-cron.log 2>&1
37 4 * * *  /opt/pharos/deploy/cron-call.sh erasure-purge    >> /var/log/pharos-cron.log 2>&1
```

Η **σειρά των τεσσάρων sweep είναι λειτουργική, όχι καλλωπιστική**: το `trials-sweep` δημιουργεί
αναστολές, το `suspended-sweep` τις προειδοποιεί, το `erasure-purge` αναφέρει τι είναι ώριμο.
Ανάποδα, κάθε στάδιο δουλεύει πάνω στη χθεσινή κατάσταση.

Δοκίμασε ένα στο περιβάλλον που θα έχει όντως ο cron, όχι στο login shell σου:

```bash
env -i PATH=/usr/bin:/bin /opt/pharos/deploy/cron-call.sh trials-sweep
```

Επίσης: εβδομαδιαίο `docker builder prune --filter until=72h` (το build cache φτάνει τα 11 GB),
και `fail2ban` για το SSH της VM αν την εκθέτεις καθόλου. Ο tunnel σημαίνει ότι **δεν χρειάζεται
καμία εισερχόμενη πόρτα**, οπότε το `ufw` μπορεί να τα κλείσει όλα εκτός του LAN.

---

## Φάση 6. Cutover

1. Άσε τη VM να σερβίρει και τα δύο, με τον Hetzner ακόμα ζωντανό. Δοκίμασε μέσω tunnel URL ή
   προσωρινού hostname, όχι ακόμα στα πραγματικά domains.
2. Γύρνα το Cloudflare στον tunnel. Το `ph-aros.com`, το `www.`, το `app.` και το `*.` δείχνουν
   πλέον στο `<UUID>.cfargotunnel.com`, proxied.
3. Επαλήθευσε **σώματα, όχι status**. Κορυφή και app απαντούν και τα δύο 200 και μοιράζονται
   τίτλο, οπότε μια παλινδρόμηση δρομολόγησης είναι αόρατη από τον κωδικό:

```bash
curl -s https://ph-aros.com/ | wc -c                 # ~369 KB, landing
curl -s https://app.ph-aros.com/account/login | wc -c # ~88 KB, με πεδίο password
curl -s -X POST https://app.ph-aros.com/api/cron/saas/trials-sweep   # 401 unauthorized
```

4. Άσε το να δουλέψει **μερικές μέρες** με τον Hetzner σβηστό αλλά **όχι διαγραμμένο**. Εκεί
   φαίνονται τα πράγματα που δεν πιάνει κανένα smoke test: το nightly backup, τα τέσσερα cron
   sweep, η ανανέωση πιστοποιητικών, η μνήμη υπό πραγματικό φορτίο.

---

## Φάση 7. Τερματισμός Hetzner

Μόνο αφού περάσουν οι μέρες της Φάσης 6, και με αυτή τη σειρά:

1. Επιβεβαίωσε ότι έχεις τοπικά: `.env.prod`, το τελευταίο ζεύγος backup, και πρόσβαση στο
   Storage Box **χωρίς** τον server.
2. Επιβεβαίωσε ότι το nightly backup τρέχει και **από τη VM**, με άφιξη επαληθευμένη στο Storage
   Box. Ένα backup που δεν έχει φτάσει ποτέ offsite από το καινούργιο σπίτι δεν μετράει.
3. Σβήσε το VPS από το Hetzner Cloud.
4. **Το Storage Box δεν το σβήνεις.** Είναι ξεχωριστό προϊόν και παραμένει ο μοναδικός offsite
   προορισμός.
5. Ενημέρωσε τα routines: το `pharos-deploy` δείχνει στη νέα VM, το `pharos-cloud-guard` το ίδιο,
   τα health-check URLs μένουν ίδια αφού τα domains δεν αλλάζουν.

---

## Παγίδες, μετρημένες όχι υποθετικές

- **Το `.env.prod` δεν είναι στο backup.** Το `backup.sh` το διαβάζει για να πάρει το
  `MONGO_PASSWORD`, δεν το αντιγράφει ποτέ. Πρώτο πράγμα που σώζεις.
- **Restore χωρίς τα αρχεία είναι κατάλογος εγγράφων που κανείς δεν μπορεί να ανοίξει.** Η Mongo
  κρατά μόνο paths. Πάντα και τα δύο αρχεία, ίδιο timestamp.
- **`cat file.gz | mongorestore --archive --gzip`**, ποτέ `gunzip -c` σε pipe. Το δεύτερο κάνει
  διπλή αποσυμπίεση και ένα μια χαρά backup μοιάζει κατεστραμμένο.
- **Ο Host header είναι η πολυ-πελατειακή δρομολόγηση.** Χάνεται εύκολα σε proxy chain και η
  βλάβη είναι σιωπηλή, όχι σφάλμα.
- **Το `npm run type-check` δεν πιάνει παραβιάσεις client/server ορίου.** Μόνο πραγματικό
  `next build`. Το έχουμε πληρώσει ήδη μία φορά, με rollback στην παραγωγή στις 6/8.
- **Το fail2ban μετράει και τις δικές σου αποτυχημένες προσπάθειες.** Λίγα ssh με κλειδωμένο
  κλειδί και κλείνεσαι απ' έξω για μία ώρα, με «Connection refused» που μοιάζει με πεσμένο
  μηχάνημα. Συνέβη στις 13/8.
