# PHAROS Landing — Progress Log

Marketing + pricing site για το PHAROS. Ξεχωριστό Next.js 15 app στο `apps/landing`, απομονωμένο ωστε να μην συγκρουεται με το `apps/web`. Δεν μπαινει στο Docker stack. Copy στα Αγγλικα.

Direction (Achilleas): DUAL μοντελο, self-hosted open-source (AGPL-3.0) ΚΑΙ paid SaaS. Το site πρεπει να δειχνει καθαρα και τα δυο (free self-host path + paid hosted plans).

Brand: PHAROS (Φαρος, lighthouse), pulsing beacon mark. Tagline «One light over everything you run.» / «Oversight on everything you own.» PH (Personal Hub) + AROS (Asset & Resource Oversight System). Dark theme. Palette bg #0a0a0a, surface #141414, accent #00ff88, cyan #00d4ff, purple #a55eea, red #ff4757, gold #ffd93d. Fonts Outfit (display) / Manrope (body) / IBM Plex Mono (mono).

---

## 2026-07-01

Task: SCAFFOLD (πρωτη εκτελεση, το `apps/landing` δεν υπηρχε).

Τι εφτιαξα (ολα hand-written, χωρις interactive create-next-app):
- `package.json` — minimal deps (next 15.5.19, react 19, react-dom 19 + typescript/@types). Scripts: dev/build/start/type-check. License AGPL-3.0-only.
- `tsconfig.json` — ιδιο profile με το apps/web (strict, bundler resolution, ES2022), paths `@/* -> ./*`.
- `next.config.ts` — minimal (reactStrictMode). ΟΧΙ standalone (δεν το χρειαζεται εκτος Docker).
- `.gitignore` — καλυπτει node_modules/.next/next-env κτλ (το root .gitignore τα καλυπτει ηδη, αλλα κραταω και local για ασφαλεια).
- `app/globals.css` — brand CSS variables (ολη η παλετα), Google Fonts import (Outfit/Manrope/IBM Plex Mono), ambient grid + glow background (`body::before` grid 42px, `body::after` radial glows accent+purple, ιδιο look με την app), `.navlink` / `.btn` (primary+ghost) / `.mono` helpers, `@keyframes beacon` για το pulsing lighthouse.
- `app/layout.tsx` — SEO metadata (title «PHAROS · Personal Hub», description, keywords, OG + Twitter tags, metadataBase, favicon svg), viewport (themeColor #0a0a0a).
- `app/components/PharosMark.tsx` — inline SVG lighthouse (tower + stripes + lamp room + light rays + pulsing beacon circle μεσω class `.beacon`), currentColor = accent.
- `app/page.tsx` — sticky nav (mark + PHAROS wordmark + Features/Pricing/GitHub links) + HERO (mark 72px, mono backronym line, clamp() 2-line gradient τιτλος accent→cyan→purple «One light over everything you run.», subcopy, δυο CTA «Get started» + «Self-host it free») + placeholder anchors για #features και #pricing (επομενα increments) + footer (mark + AGPL-3.0 + GitHub/License links).
- `public/favicon.svg` — lighthouse σε rounded dark tile.

Verify:
- `npm install` OK (2 moderate audit warnings, transitive, μη-blocking).
- `npm run type-check` -> exit 0, καθαρο.
- `npm run build` -> success, ολα static (/ 102 kB First Load JS). Δεν αφησα dev server ανοιχτο. Δεν αγγιξα Docker / apps/web / apps/mobile.

Επομενο section (next increment): (c) FEATURES section — cards για τα core modules (inventory/shopping, receipts+AI, expenses, statements/installments, subscriptions, vouchers, reports, network) με brand accent glows. Μετα (d) PRICING (self-hosted free AGPL + paid hosted tiers).

Needs-Achilleas:
- Τελικες τιμες SaaS (Free / Pro / Team) — θα μπουν ως TBD placeholders στο pricing section μεχρι να τις επιβεβαιωσεις.
- Domain landing (τωρα placeholder `https://pharos.app` στο metadataBase) — πες μου το πραγματικο domain.
- GitHub repo URL (τωρα `https://github.com/AchilleasGekas/pharos`) — επιβεβαιωσε αν ειναι public/σωστο για τα CTA links.

## 2026-07-01 (cont.)

Απαντησεις Achilleas: (1) τελικη τιμη SaaS αργοτερα, τωρα ενδεικτικα πακετα με σωστα features· (2) domain = `ph-aros.com`· (3) το git ερωτημα ηταν ασαφες.

Τι εφτιαξα:
- FEATURES section (increment c): `app/components/Icon.tsx` (compact lucide-style stroke icons: package/receipt/wallet/card/calendar/ticket/chart/wifi/check) + 8 module cards σε responsive grid (4→2→1 στηλες), καθε card με colored icon badge + accent glow (blur orb πισω απο το icon), hover lift. Modules: Inventory & shopping, Receipts read by AI, Expenses & income, Statements & installments, Subscriptions, Vouchers & coupons, Reports, Network. Copy αντλει απο τα πραγματικα features της app (multi-store price tracking, AI receipt parse any-language, recurring auto-detect + anomaly flags, installment merge, renewal calendar, voucher expiry, cash-flow/net-position charts, UniFi live dashboard).
- PRICING section (increment d): 4 tiers, DUAL μοντελο. «Self-hosted» = Free / AGPL-3.0 (ολα τα modules, δικο σου hardware, bring-your-own-AI, SMB/FTP/OneDrive backups, CTA -> GitHub docker image). Managed: «Hosted · Free» / «Hosted · Pro» (highlight, «Most popular» badge, AI included) / «Hosted · Team» (multi-user, roles). Τιμες = **TBD** (ενδεικτικα, οπως ζητηθηκε) με features που αντιστοιχουν σωστα ανα tier. CTA hosted -> `#waitlist` anchor + disclaimer οτι το self-hosting μενει free.
- Domain: `metadataBase` στο layout.tsx `https://pharos.app` -> **`https://ph-aros.com`**.
- Git fix: το repo `github.com/achilleasgkekas/pharos` ειναι **PRIVATE** (gh repo view). Διορθωσα το casing του URL σε ολα τα CTA/footer links (ηταν `AchilleasGekas`, σωστο `achilleasgkekas`). ΠΡΟΣΟΧΗ: αφου ειναι private, οι «GitHub» + «Self-host it free» + license links θα δινουν 404 σε επισκεπτες. Για το OSS (AGPL) σκελος το repo πρεπει καποια στιγμη να γινει public (η ξεχωριστο public mirror).
- `.claude/launch.json`: πρoσθεσα config `landing-dev` (port 3100) για preview (additive, δεν πειραξα το homepage-dev).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 102 kB).
- Preview (port 3100): DOM inspect επιβεβαιωσε 8 feature cards + 4 price cards, σωστα titles/colors, «Most popular» highlight, lowercase github links, καθαρα console errors. (Το preview_screenshot επαναφερει scroll στο top -> scrolled captures βγαινουν μαυρα· inspect/eval επιβεβαιωσαν το render.) Δεν αφησα server ανοιχτο. Docker/web/mobile αθικτα.

Επομενο section (next increment): (e) Polish — «How it works» / self-host steps (docker compose / GHCR), ισως screenshots της app, mobile QA pass, waitlist form (mailto η placeholder), OG image asset.

Needs-Achilleas (open):
- Τελικες τιμες hosted tiers (τωρα TBD).
- Να γινει το GitHub repo public (η public mirror) ωστε τα CTA/self-host links να μη δινουν 404.
- Επιβεβαιωση οτι το `ph-aros.com` ειναι το τελικο domain (μπηκε στο metadata).

## 2026-07-01 (cont.²)

Task: (e) Polish, μερος 1 — «How it works» / self-host steps section.

Τι εφτιαξα:
- Νεο SELF-HOST section (`app/page.tsx`) αναμεσα σε Features και Pricing: eyebrow «Self-host» + τιτλος «Up and running in three steps» + subcopy (ενα Docker Compose file, τα δεδομενα δεν φευγουν απο το μηχανημα). 3 numbered step cards (`STEPS` array): «Clone & configure» / «docker compose up» / «Open the dashboard» με copy που αντλει απο το πραγματικο stack (web + MongoDB + SearXNG, bring-your-own-AI, LAN/VPN, zero telemetry). Απο κατω ενα syntax-highlighted `<pre class="code-block">` quick-start (git clone / cd / cp .env / docker compose up -d) με tokens accent (cmd) + faint (comments).
- Nav: προσθεσα link «Self-host» (#self-host) αναμεσα σε Features και Pricing.
- `globals.css`: `.steps-grid` (3→1 στηλες responsive), `.step-card` + `.step-num` (mono badge, accent), `.code-block` (dark #0d0d0d, mono, horizontal scroll) + `.tok-cmd`/`.tok-comment`.
- `.claude/launch.json`: ξαναπροσθεσα το `landing-dev` config (port 3100) — ειχε χαθει (μαλλον concurrent routine το overwrite-αρε). ΔΕΝ το commit-αρω (root shared file, αποφυγη collision), μονο local για preview.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 102 kB First Load JS).
- Preview (port 3100, landing-dev): DOM/eval επιβεβαιωσε 3 step cards (σωστοι τιτλοι), code-block με «docker compose», nav 4 links (Features/Self-host/Pricing/GitHub), μηδεν console errors. Δεν αφησα server ανοιχτο. Docker/web/mobile αθικτα.

Επομενο increment: (e) συνεχεια — waitlist form (mailto η placeholder) αντι για σκετο #waitlist anchor, mobile QA pass, OG image asset, ισως app screenshots.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (τωρα TBD).
- Να γινει το GitHub repo public (η public mirror) ωστε τα CTA/self-host links να μη δινουν 404.
- Επιβεβαιωση `ph-aros.com` ως τελικο domain.

## 2026-07-01 (cont.³)

Task: (e) Polish, μερος 2 — πραγματικο WAITLIST section (τα pricing CTA «Join the waitlist» εδειχναν σε `#waitlist` που ηταν απλως ενα disclaimer paragraph, οχι φορμα).

Τι εφτιαξα:
- `app/components/Waitlist.tsx` (νεο, client component `'use client'`): email input + «Join the waitlist» button. Client-side email validation (regex) -> το button ειναι disabled μεχρι να δωσεις εγκυρο email. Στο submit ανοιγει `mailto:hello@ph-aros.com` prefilled (subject «PHAROS hosted waitlist» + body με το email) + δειχνει confirmation note με fallback «write to hello@ph-aros.com». **Χωρις backend** (το landing ειναι static) -> mailto ειναι ο πιο απλος αξιοπιστος τροπος. Contact = `hello@ph-aros.com` (branded, ταιριαζει με το domain· ΧΡΕΙΑΖΕΤΑΙ inbox setup, βλ. Needs-Achilleas).
- `app/page.tsx`: αφαιρεσα το `id="waitlist"` απο το pricing disclaimer· νεο dedicated `<section id="waitlist">` αναμεσα σε Pricing και Footer — card με eyebrow «Hosted beta», τιτλο «Be first on the managed version», subcopy, `<Waitlist/>`, + link «Rather self-host? It stays free under AGPL-3.0» -> GitHub. Import του Waitlist. Τα 3 pricing CTA `#waitlist` δειχνουν πλεον στο πραγματικο section.
- `app/globals.css`: `.waitlist-form` (flex, wrap), `.waitlist-input` (surface-2, focus accent border, placeholder faint), `.waitlist-form .btn:disabled` (opacity 0.5, no hover lift), `.waitlist-note` (flex-basis 100%).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS· +1 kB απο το νεο client component).
- Preview (port 3100, landing-dev): DOM/eval επιβεβαιωσε waitlist section renders (heading «Be first on the managed version», input placeholder «you@example.com», button «Join the waitlist» **disabled αρχικα**), typing εγκυρο email -> button enabled, μηδεν console errors. Δεν αφησα server ανοιχτο. Docker/web/mobile αθικτα. Το `.claude/launch.json` (landing-dev config) εμεινε local-only, ΔΕΝ commit (shared root file, collision guard).

Επομενο increment: (e) συνεχεια — OG image asset (τωρα μονο meta tags, χωρις εικονα), app screenshots section (real UI), mobile QA pass στα νεα sections.

Needs-Achilleas (open):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- **Contact inbox**: το waitlist mailto δειχνει σε `hello@ph-aros.com`. Στησε το inbox (η πες μου αλλη διευθυνση) ωστε τα waitlist emails να φτανουν καπου.

## 2026-07-01 (cont.⁴)

Task: (e) Polish, μερος 3 — OG image asset (πριν υπηρχαν μονο meta tags, χωρις εικονα -> τα social shares εβγαζαν κενη/generic προεπισκοπηση).

Τι εφτιαξα:
- `app/opengraph-image.tsx` (νεο): branded 1200×630 OG card μεσω `next/og` `ImageResponse` (built-in στο Next 15, μηδεν νεο dependency, generated at build time -> static route). Dark bg #0a0a0a + accent/cyan blur glows, inline lighthouse SVG (ιδιο mark με το PharosMark), wordmark «PHAROS», headline «One light over everything you run.», subcopy (modules), + 3 chips «Self-hosted» / «Open-source · AGPL-3.0» / «Privacy-first». Παλετα/γραμματοσειρα brand. (Απεφυγα το em-dash στο subcopy -> colon.)
- `app/twitter-image.tsx` (νεο): re-export του opengraph-image (ιδια εικονα για το summary_large_image του Twitter). Το layout.tsx ειχε ηδη `twitter.card: summary_large_image` + openGraph -> τωρα το Next auto-wire-αρει τα image meta tags απο αυτα τα route files.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· νεα routes `/opengraph-image` + `/twitter-image` prerendered ○ (Static), / στα 103 kB.
- Runtime check: served το build σε port 3100, `curl /opengraph-image` -> HTTP 200, `content-type: image/png`, `file` -> «PNG image data, 1200 x 630, 8-bit/color RGBA». Οπτικη επιθεωρηση της PNG -> σωστο render (lighthouse + PHAROS + tagline + 3 chips, σωστα χρωματα). `/twitter-image` -> 200 image/png. Σταματησα τον server. Docker/web/mobile αθικτα.

Επομενο increment: (e) συνεχεια — app screenshots / product-shots section (real UI), mobile QA pass στα sections (hero/features/self-host/pricing/waitlist σε ~380px).

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.
