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

## 2026-07-01 (cont.⁵)

Task: (e) Polish, μερος 4 — FAQ section (πριν δεν υπηρχε· τα conversion questions «ειναι οντως free;», «τι δεδομενα φευγουν;», «θελω AI key;» δεν απαντιονταν πουθενα).

Τι εφτιαξα:
- `app/page.tsx`: νεο `FAQS` array (6 Q&A) + dedicated `<section id="faq">` αναμεσα σε Pricing και Waitlist. Native `<details>/<summary>` accordion (μηδεν JS, static, accessible, keyboard-friendly) — καθε item: ερωτηση + rotating chevron, expand δειχνει την απαντηση. Ερωτησεις: self-host free (AGPL-3.0, no seat limits), τι δεδομενα φευγουν (τιποτα by default, zero telemetry, AI = μονο αν το στειλεις σε cloud provider, local Ollama = offline), AI key (optional, per-feature toggle, bring-your-own η Ollama), τι χρειαζεται (Docker + always-on machine: Mac mini/NAS/Proxmox LXC), hosted vs self-hosted, migrate μεταξυ τους (JSON export/import, merge-by-id).
- Nav: link «FAQ» (#faq) αναμεσα σε Pricing και GitHub.
- `app/components/Icon.tsx`: νεο `chevron` path (`m6 9 6 6 6-6`).
- `app/globals.css`: `.faq-list` (flex column), `.faq-item` (card, border-light στο [open]), `.faq-q` (summary, no default marker, display font), `.faq-chevron` (rotate 180° + accent στο [open]), `.faq-a` (text-dim). Κρυβω τον default disclosure marker (list-style none + ::-webkit-details-marker).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS, αμεταβλητο — pure HTML/CSS, μηδεν νεο JS).
- Δεν σηκωσα preview server (static markup, native details, low-risk). Docker/web/mobile αθικτα. Το `.claude/launch.json` (local landing-dev config) ΔΕΝ commit (shared root file, collision guard).

Επομενο increment: (e) συνεχεια — app screenshots / product-shots section (real UI, χρειαζεται assets), mobile QA pass στα sections (~380px), ισως testimonials/social-proof placeholder.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-01 (cont.⁶)

Task: (e) Polish, μερος 5 — product showcase / «see it in action» section (πριν το landing ηταν all-text: hero -> features, χωρις καμια οπτικη του προϊοντος. Ελλειψη screenshot assets -> εφτιαξα CSS-drawn app-window mockup αντι για πραγματικες εικονες).

Τι εφτιαξα:
- `app/page.tsx`: νεο `<section id="preview">` αναμεσα σε Hero και Features. Faux app-window (browser chrome: 3 traffic-light dots + mono address chip «pharos.local / dashboard» + «AI online» pulse-dot) με ενα mini dashboard mockup: header «Good evening, Achilleas» + mono date, 3 stat tiles (Net position €12,708 accent / Owed €1,149 gold / This month −€221 cyan), + 8 module tiles (Inventory/Receipts/Installments/Subscriptions/Expenses/Vouchers/Reports/Network) με icon-dot glow + count. Δυο νεα data arrays (`SHOWCASE_STATS`, `SHOWCASE_MODS`), reuse του υπαρχοντος `Icon` (ολα τα 8 names υπαρχουν ηδη). Μηδεν νεο dependency, μηδεν JS — pure markup/CSS.
- `app/globals.css`: `.showcase` (rounded window, border-light, drop-shadow, accent+purple corner glows via ::before), `.win-bar`/`.win-dots`/`.win-addr`/`.win-online` (chrome), `.win-body`/`.win-head`, `.stat-row`+`.stat-tile` (3-col grid), `.mod-grid`+`.mod-tile`+`.mod-ico` (4-col, icon glow). Responsive: mod-grid 4->2 @900px, stat-row+mod-grid ->1col @560px + tighter win padding + narrower addr.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS, αμεταβλητο — pure HTML/CSS).
- Preview (port 3100, landing-dev): DOM eval επιβεβαιωσε showcase renders (addr, 3 stat values €12,708/€1,149/−€221, ολα τα 8 module titles), inspect στο `.stat-tile .val` -> color rgb(0,255,136) accent + Outfit 800 24px (CSS applied), μηδεν console errors. Σταματησα τον server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (local landing-dev config) ΔΕΝ commit (shared root file, collision guard).

Επομενο increment: (e) συνεχεια — mobile QA pass ολων των sections σε ~380px (hero/showcase/features/pricing/waitlist/faq), ισως testimonials/social-proof placeholder, η αντικατασταση του CSS mockup με πραγματικα app screenshots οταν υπαρξουν assets.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02

Task: (e) Polish, μερος 6 — mobile QA pass ~380px (το nav δεν ειχε ΚΑΜΙΑ responsive συμπεριφορα· logo + 5 text links @28px gap στριμωχνοντουσαν/ξεχειλιζαν σε στενη οθονη).

Τι εφτιαξα:
- `app/page.tsx`: το `<nav>` πηρε class `site-nav` (αντι για inline flex style)· τα in-page anchors Features/Self-host/FAQ πηραν class `nav-anchor` (secondary), ενω Pricing + GitHub μενουν παντα ορατα (primary CTA target + repo).
- `app/globals.css`: νεο `.site-nav` base (flex, gap 28). Νεα breakpoints: `@media (max-width:720px)` -> `.nav-anchor { display:none }` + gap 20 (nav μενει logo + Pricing + GitHub, χωρις hamburger/JS). `@media (max-width:560px)` += `.container { padding 0 18px }`. Νεο `@media (max-width:480px)` -> σφιχτοτερο vertical rhythm ανα section (#top 72/60, #features/#self-host/#faq 44, #pricing 44/64, #preview 8/44) + `.btn { width:100% }` (τα hero CTA κουμπια γινονται full-width stacked στο κινητο).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS, αμεταβλητο — pure CSS/markup, μηδεν νεο JS).
- Preview (landing-dev, port 3100) σε viewport 380×800: nav δειχνει μονο «Pricing» + «GitHub» (τα 3 nav-anchor hidden, offsetParent null), header 65px καθαρο, ΜΗΔΕΝ horizontal scroll (scrollWidth == innerWidth == 380). Screenshot hero -> full-width stacked «Get started»/«Self-host it free», lighthouse mark + gradient headline OK. Grids ολα 1-col στα 380 (feature/pricing/stat/mod), μηδεν console errors. Σταματησα τον server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (local landing-dev config, shared root) ΔΕΝ commit.

Επομενο increment: (e) συνεχεια — testimonials/social-proof strip (π.χ. «open-source / privacy-first / zero-telemetry» badges αντι για fake quotes), η αντικατασταση του CSS mockup με πραγματικα app screenshots οταν υπαρξουν assets.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.)

Task: (e) Polish, μερος 7 — trust / principles strip (social-proof χωρις fake quotes· το landing πηγαινε features -> self-host χωρις καμια δηλωση αξιων, ενω το ολο pitch ειναι privacy/open-source· εβαλα honest badges αντι για ψευτικα testimonials).

Τι εφτιαξα:
- `app/page.tsx`: νεο `TRUST` array (5 principles) + νεα `<section id="trust">` αναμεσα σε Features και Self-host. Καρτες: Open source (AGPL-3.0, accent), Privacy-first (cyan), Zero telemetry (purple), Local-first (gold), No lock-in (red). Reuse του υπαρχοντος `Icon` + `card` idiom (icon-dot + blurred glow, ιδιο pattern με feature-card). Semantic `<ul>/<li>` (list of principles). Μηδεν νεο dependency, μηδεν JS — pure markup/CSS.
- `app/components/Icon.tsx`: 5 νεα lucide-style paths (`shield`, `eyeOff`, `code`, `server`, `unlock`).
- `app/globals.css`: `.trust-grid` (5-col grid, list-reset), `.trust-card` (hover lift), `.trust-icon`/`.trust-glow` (40px dot + blur-16 glow @0.26). Responsive: trust-grid 5->3 @900px -> 1 @560px· #trust μπηκε στο 480px vertical-rhythm rule (40px padding).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS, αμεταβλητο — pure HTML/CSS, μηδεν νεο JS).
- Preview (landing-dev, port 3100): DOM eval επιβεβαιωσε 5 trust-cards render με σωστα brand χρωματα (accent/cyan/purple/gold/red), ολα με SVG icon. Στα 1280px το `.trust-grid` = 5 columns (201px το καθενα), glow opacity 0.26 + blur 16px applied. Hero screenshot OK, μηδεν console errors. Σταματησα τον server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (local landing-dev config, shared root) ΔΕΝ commit (collision guard).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, η secondary CTA band πριν το footer, η comparison table self-host vs hosted.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.²)

Task: (e) Polish, μερος 8 — comparison table self-host vs hosted (νεα `<section id="compare">` αναμεσα σε Pricing και FAQ· το landing ειχε pricing cards αλλα καμια συγκεντρωτικη side-by-side συγκριση των δυο tracks, που ειναι η βασικη αποφαση του επισκεπτη).

Τι εφτιαξα:
- `app/page.tsx`: νεο `COMPARE` array (8 dimensions: Where it runs / Your data / Setup / Updates & backups / AI parsing / Offline use / Cost / Support) + semantic `<table class="compare">` (thead 3-col, tbody με `<th scope="row">` + 2 `<td>`, το Hosted column με `.hl` accent). Wrapper `.compare-wrap` (rounded, border, overflow hidden). Κατω footnote «Same app either way. Export to JSON and switch whenever you like.». `.sr-only` για το κενο header cell. Reuse του υπαρχοντος container/section idiom. Μηδεν νεο dependency, μηδεν JS — pure markup/CSS.
- `app/globals.css`: νεα `.sr-only` utility· `.compare-wrap` + `.compare` table styles (border-collapse, thead mono uppercase σε surface-2, `th[scope=row]` 34% bold, `.hl` accent χρωμα + πρασινο tint background στο Hosted column, row hover). Mobile stacking @560px: thead hidden, rows -> blocks, καθε `td::before { content: attr(data-col) }` δειχνει «Self-hosted: / Hosted: » label (proper responsive table, οχι horizontal scroll). `#compare` μπηκε στο 480px vertical-rhythm rule (24/48 padding).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS, αμεταβλητο — pure HTML/CSS, μηδεν νεο JS).
- Preview (landing-dev, port 3100): DOM eval @1280px επιβεβαιωσε 8 rows, headers [Feature/Self-hosted/Hosted], Hosted column computed color rgb(0,255,136) accent, first row «Where it runs -> Your own hardware / Our managed servers», last «Support -> Community & docs / Priority email». @380px: thead display:none, tr display:block, `td.hl::before` = "Hosted: ", scrollWidth==innerWidth==380 (μηδεν horizontal scroll), μηδεν console errors. Σταματησα τον server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (local landing-dev config, shared root) ΔΕΝ commit (collision guard).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, η secondary CTA band πριν το footer, η μικρες micro-copy βελτιωσεις.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.³)

Task: (e) Polish, μερος 9 — richer multi-column footer (το footer ηταν ενα single-row στριπ με μονο logo + GitHub + License· ενα proper marketing footer βοηθαει navigation, SEO, και δινει ισορροπια στο κατω μερος της σελιδας).

Τι εφτιαξα:
- `app/page.tsx`: αντικατεστησα το single-row footer με `.footer-grid` (4 στηλες): brand column (PharosMark + PHAROS wordmark + tagline «One light over everything you run. Personal Hub · Asset & Resource Oversight System.» + `// achilleas` mono note) + 3 link columns — Product (Features/Pricing/Self-host/Compare, in-page anchors), Resources (GitHub, Docs=README, Report an issue=/issues, Hosted beta=#waitlist), Legal (License AGPL-3.0, FAQ). Κατω `.footer-bar` (border-top) με «© 2026 PHAROS · AGPL-3.0» + «Open source · self-hostable · no telemetry». Ολα τα links honest (in-page anchors η πραγματικα GitHub URLs, μηδεν dead pages). Reuse του υπαρχοντος `.navlink`/`.mono`/`.container`/`PharosMark` idiom. Μηδεν νεο dependency, μηδεν JS.
- `app/globals.css`: νεα `.footer-grid` (grid 2fr/1fr/1fr/1fr, gap 40), `.footer-col` (flex column, gap 12, align-start), `.footer-heading`, `.footer-bar` (space-between, border-top, padding-top 28). Responsive: @900px -> 2 columns με το brand column `grid-column: 1/-1` full-width· @560px -> 1 column stack + footer-bar align flex-start. Footer padding 32px -> 56px 0 32px.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 103 kB First Load JS, αμεταβλητο — pure HTML/CSS, μηδεν νεο JS).
- Preview (landing-dev, port 3100): DOM eval επιβεβαιωσε footer render — 3 headings [Product/Resources/Legal], 10 links (Features…FAQ), 2 footer-bar spans, hScroll false (μηδεν horizontal overflow). Hero screenshot OK, μηδεν console errors (error level: none). Σταματησα τον server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (local landing-dev config, shared root) ΔΕΝ commit (collision guard).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, secondary CTA band, η micro-copy βελτιωσεις.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain.
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.⁴)

Task: (e) Polish, μερος 10 — JSON-LD structured data (SEO). Το layout ειχε ηδη πληρη metadata + OG/Twitter, αλλα ελειπε schema.org markup που δινει rich results στο Google (ιδιως FAQ rich snippets). Ηταν το πιο ουσιαστικο εναπομειναν SEO κομματι.

Τι εφτιαξα:
- `app/page.tsx`: νεα σταθερα `SITE_URL = 'https://ph-aros.com'` + `JSON_LD` object (schema.org `@graph` με δυο types): (1) `SoftwareApplication` — name PHAROS, applicationCategory BusinessApplication, operatingSystem Docker/Linux/macOS, url, author, license (AGPL-3.0 URL), softwareHelp (README), `offers` price 0 EUR «Self-hosted edition, open source under AGPL-3.0» (ΟΧΙ fabricated hosted price — TBD). (2) `FAQPage` — `mainEntity` **χτισμενο απο το υπαρχον `FAQS` array** (map -> Question/acceptedAnswer), ωστε το structured data να μενει παντα in-sync με τα rendered FAQs. Render μεσα στο `<main>` ως `<script type="application/ld+json" dangerouslySetInnerHTML={...}>` (το standard Next App-Router pattern· static/controlled data, μηδεν user input -> ασφαλες). Μηδεν νεο dependency, μηδεν client JS.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — inline HTML script, μηδεν bundle impact).
- Prerendered HTML check (`.next/server/app/index.html`): `application/ld+json` + `FAQPage` + `SoftwareApplication` και τα τρια present. Δεν χρειαστηκε preview server (JSON-LD ειναι non-visual head/body metadata· επιβεβαιωθηκε στο static output). Docker/web/mobile αθικτα.

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, secondary CTA band, η micro-copy βελτιωσεις. (Προαιρετικα: BreadcrumbList/Organization JSON-LD, sitemap.ts + robots.ts.)

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD) — το SoftwareApplication offer δηλωνει μονο το free self-host, οχι hosted price.
- GitHub repo public (η mirror) — CTA/self-host/footer links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL στο JSON-LD το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.⁵)

Task: (e) Polish, μερος 11 — sitemap.ts + robots.ts (SEO crawl surface). Το JSON-LD (cont.⁴) εδωσε rich results· ελειπαν ομως τα δυο βασικα crawl-directive αρχεια που καθε crawler ψαχνει πρωτα. Ηταν η προαιρετικη συνεχεια που ειχα σημειωσει στο cont.⁴, self-contained, μηδεν assets/decisions.

Τι εφτιαξα:
- `app/robots.ts`: Next App-Router MetadataRoute.Robots — `userAgent: '*'`, `allow: '/'`, `host` + `sitemap` δειχνουν στο `https://ph-aros.com`. Παραγει `/robots.txt` ως static route.
- `app/sitemap.ts`: MetadataRoute.Sitemap — ενα entry (root URL, single-page landing), `lastModified` σταθερη ημερομηνια (2026-07-02, οχι `new Date()` ωστε το output να μενει deterministic μεταξυ builds), `changeFrequency: weekly`, `priority: 1`. Παραγει `/sitemap.xml`. Το SITE_URL const ιδιο με layout/page JSON-LD. Μηδεν νεο dependency, μηδεν client JS.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· δυο νεα static routes `/robots.txt` + `/sitemap.xml` στο route table, `/` αμεταβλητο 761 B / 103 kB.
- Prerendered output: `.next/server/app/robots.txt.body` = σωστο `User-Agent: * / Allow: / / Host + Sitemap`· `.next/server/app/sitemap.xml.body` = εγκυρο `<urlset>` με το root `<loc>`. Non-visual metadata routes -> επιβεβαιωθηκαν στο static output (οπως το JSON-LD), δεν χρειαστηκε preview server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/robots.ts + app/sitemap.ts).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα screenshots οταν υπαρξουν assets, secondary CTA band πριν το footer, η micro-copy βελτιωσεις. (Προαιρετικα: Organization/BreadcrumbList JSON-LD.)

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL σε layout/page/robots/sitemap το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.⁶)

Task: (e) Polish, μερος 12 — Organization + WebSite JSON-LD nodes. Το cont.⁴ εδωσε SoftwareApplication + FAQPage· ελειπαν τα δυο entity-level nodes που βοηθουν το Google να καταλαβει το brand ως οντοτητα (knowledge-graph eligibility). Ηταν το προαιρετικο επομενο που ειχα σημειωσει, self-contained, μηδεν assets/decisions.

Τι εφτιαξα:
- `app/page.tsx` (`JSON_LD` `@graph`): προσθεσα δυο nodes ΠΡΙΝ το SoftwareApplication. (1) `Organization` με `@id` `${SITE_URL}/#organization` — name PHAROS, alternateName ο backronym («Personal Hub · Asset & Resource Oversight System»), url, logo (`/favicon.svg` absolute), description, `sameAs: [GITHUB_URL]`. (2) `WebSite` με `@id` `${SITE_URL}/#website` — name/url/inLanguage «en» + `publisher` reference στο `#organization`. Προσθεσα και `publisher: {'@id': …#organization}` στο υπαρχον SoftwareApplication ωστε τα nodes να δενουν σωστα με cross-references (οχι διπλα inline objects). Ολα deterministic (υπαρχοντα consts SITE_URL/GITHUB_URL), μηδεν νεο dependency, μηδεν client JS.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — inline HTML script, μηδεν bundle impact).
- Prerendered HTML (`.next/server/app/index.html`): και τα 8 `@type` present (Organization, WebSite, SoftwareApplication, FAQPage, Offer, Person, Question, Answer)· το `#organization` id εμφανιζεται 6× (definition + publisher refs), αρα τα cross-references resolve. Non-visual head/body metadata -> επιβεβαιωθηκε στο static output (οπως JSON-LD/robots/sitemap), δεν χρειαστηκε preview server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, secondary CTA band, η micro-copy βελτιωσεις. (Προαιρετικα: BreadcrumbList JSON-LD, η per-plan Offer nodes οταν κλεισουν οι τιμες.)

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.⁷)

Task: (e) Polish, μερος 13 — accessibility pass (prefers-reduced-motion + keyboard focus ring). Δυο πραγματικα a11y κενα που ειχε η σελιδα: (1) ο pulsing beacon + τα hover-lift transforms + το `scroll-behavior: smooth` ετρεχαν παντα, αγνοωντας το OS «reduce motion» setting· (2) δεν υπηρχε global keyboard focus ring — μονο το `.waitlist-input:focus` ειχε styling, οποτε keyboard-only χρηστες δεν εβλεπαν που βρισκονται σε links/buttons/nav.

Τι εφτιαξα (μονο `app/globals.css`):
- `:focus-visible` ring για a/button/.btn/.navlink/.waitlist-input — 2px solid `var(--accent)` (brand green) + outline-offset 3px + radius 6. Μονο keyboard (`:focus-visible`, οχι `:focus`), ωστε mouse clicks να μη δειχνουν ring.
- `@media (prefers-reduced-motion: reduce)`: `scroll-behavior: auto` στο html, `.beacon { animation: none; opacity: 1 }` (σταθερο, οχι σβηστο), universal `*` clamp σε animation/transition-duration 0.01ms + iteration-count 1, και ρητο `transform: none` στα btn hover ωστε τιποτα να μη πηδαει. Μηδεν νεο dependency, μηδεν JS, μηδεν layout impact.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure CSS, μηδεν bundle impact).
- Preview (landing-dev, port 3100): DOM eval μεσω document.styleSheets επιβεβαιωσε reducedMotionRulePresent=true + focusVisibleRulePresent=true· beacon animationName='beacon' σε normal motion (οκ)· console errors: none· hero screenshot καθαρο (brand palette/beacon/gradient wordmark/2 CTAs). Σταματησα τον server. (ΣΗΜ: το preview eval εδωσε winW=0/hScroll=true — headless viewport quirk αυτης της harness, οχι πραγματικο overflow· CSS outline/animation δεν επηρεαζει scrollWidth.) Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, secondary CTA band, η micro-copy βελτιωσεις. (Προαιρετικα: per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες, prefers-color-scheme fallback αν ποτε μπει light mode.)

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.⁸)

Task: (e) Polish, μερος 14 — «Runs anywhere you do» deploy-targets strip μεσα στο self-host section. Το self-host section ειχε τα 3 βηματα + το docker quick-start code block, αλλα δεν ελεγε ΠΟΥ τρεχει· για το homelab κοινο (το core self-host audience) η βεβαιοτητα «δουλευει στο δικο μου setup» ειναι πραγματικο conversion σημειο. Ηταν το πιο ουσιαστικο εναπομειναν κομματι που δεν χρειαζεται assets (τα screenshots μενουν blocked χωρις πραγματικα app images) και δεν επικαλυπτει υπαρχον section (το trust ειναι principles, οχι deploy targets).

Τι εφτιαξα:
- `app/page.tsx`: νεα σταθερα `DEPLOY_TARGETS` (6 strings: Docker Compose, Proxmox LXC, Any Linux VM, Raspberry Pi (ARM64), Synology / NAS, Bare metal — ολα αληθινα per CLAUDE.md: Proxmox LXC ειναι ο τελικος προορισμος, DS923+ NAS, Docker stack) + νεο `.deploy-strip` block μεσα στο `#self-host`, ΜΕΤΑ το code block: `.mono` label «Runs anywhere you do» + `<ul>` απο pills (καθε pill = accent dot + κειμενο). Semantic list, μηδεν client JS, μηδεν icons (καθαρες text pills).
- `app/globals.css`: νεα CSS `.deploy-strip`/`.deploy-label`/`.deploy-pills` (flex-wrap center) / `.deploy-pill` (rounded 999px, surface bg, border, hover -> border-light + text brighten) / `.deploy-dot` (6px accent κουκιδα). Ταιριαζει το υπαρχον pill/card idiom (ιδια border/surface vars, ιδιο hover pattern με step-card).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (`.next/server/app/index.html`): «Runs anywhere you do» + «Proxmox LXC» + `deploy-pill` present.
- Preview (landing-dev, port 3100): DOM eval επιβεβαιωσε strip present, label σωστο, και τα 6 pills renderαρουν (count=6)· `preview_inspect .deploy-pill` -> border-radius applied, border rgb(42,42,42)=var(--border), color rgb(153,153,153)=var(--text-dim) (σωστη brand παλετα)· console errors: none. Σταματησα τον server. (ΣΗΜ: το preview_screenshot πιανει παντα το top του page — γνωστο headless viewport quirk αυτης της harness, οχι bug· η επαληθευση εγινε μεσω DOM eval + inspect + static output.) Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx + app/globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, secondary CTA band, η micro-copy βελτιωσεις. (Προαιρετικα: per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες, «who it's for» personas section.)

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.⁹)

Task: (e) Polish, μερος 15 — «Who it's for» personas section. Ηταν το προαιρετικο επομενο που ειχα σημειωσει (self-contained, μηδεν assets, μηδεν decisions, δεν επικαλυπτει υπαρχον section: τα features λενε ΤΙ κανει, τα personas λενε ΓΙΑ ΠΟΙΟΝ ειναι). Τα screenshots του #preview mockup μενουν blocked χωρις πραγματικα app images, οποτε προχωρησα με copy-only increment.

Τι εφτιαξα:
- `app/page.tsx`: νεα σταθερα `PERSONAS` (3 rich cards) + νεο `#who` section αναμεσα σε Features και Trust. eyebrow «Who it's for» + h2 «Built for people who own their stack». Τα 3 personas: (1) Homelabbers (server icon, accent) — Proxmox/NAS/UniFi κοινο· (2) Receipt & money trackers (receipt icon, cyan) — receipts/installments/subscriptions· (3) Privacy-first owners (shield icon, purple) — self-host/offline/zero-telemetry. Ολα icons απο το υπαρχον Icon set (server/receipt/shield). Reuse του `.feature-icon`/`.feature-glow` treatment. Μηδεν client JS, semantic `<article class="card">`.
- `app/globals.css`: νεα `.persona-grid` (repeat(3,1fr), gap 18) + `.persona-card` (hover translateY(-3px) + border-light, ιδιο idiom με feature/trust cards) + responsive: 1fr στο <=900px (matches το steps stacking).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (`.next/server/app/index.html`): «Who it's for», «Built for people who own their stack», «Homelabbers», «Privacy-first owners», `persona-card` ολα present.
- Preview (landing-dev, port 3100): DOM eval -> section present, h2 σωστο, count=3, titles [Homelabbers, Receipt & money trackers, Privacy-first owners], και τα 3 icons rendered (feature-icon svg present)· console errors: none. Σταματησα τον server. Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx + app/globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets, secondary CTA band (κατω απο compare/faq), η per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες. Προαιρετικα: «who» link στο nav αν χρειαστει (τωρα reachable μονο με scroll).

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.¹⁰)

Task: (e) Polish, μερος 16 — secondary CTA band αναμεσα σε Compare και FAQ. Ηταν το explicit «επομενο increment» που ειχα σημειωσει (self-contained, μηδεν assets, high-conversion). Το τοποθετησα ΜΕΤΑ το compare table (φυσικο conversion σημειο: «ειδες τη διαφορα, τωρα διαλεξε») και ΠΡΙΝ το FAQ, ωστε να μην επικαλυπτεται με το waitlist card στο τελος (που ειναι email-capture μονο). Το band προσφερει ΚΑΙ τα δυο paths (self-host free / hosted) — ταιριαζει με το dual-model positioning.

Τι εφτιαξα:
- `app/page.tsx`: νεο `#cta` section με `.cta-band` -> `.cta-band-inner`: mono eyebrow «Two paths, one app» + h2 «Ready to see everything in one place?» + subtext (run it free forever ή hosted, switch either way) + 2 buttons (Get started -> #pricing, Self-host it free -> GITHUB_URL, ιδια btn-primary/btn-ghost με το hero). Semantic, μηδεν client JS.
- `app/globals.css`: νεες `.cta-band` (border-light, radius 18, surface bg, overflow hidden) + `.cta-band::before` (dual radial-gradient glow accent 10%/purple 10%, ιδιο idiom με `.showcase::before`) + `.cta-band-inner` (z-index 1, padding 52px 28px). Reuse υπαρχουσας παλετας/glow pattern.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (`.next/server/app/index.html`): «Ready to see everything in one place?» + «Two paths, one app» + `cta-band` ολα present.
- Preview (landing-dev, port 3100): DOM eval -> band present, heading σωστο, 2 buttons με σωστα hrefs (#pricing, github), borderRadius 18px, inner padding 52px 28px· console errors: none· hero screenshot καθαρο (brand palette intact). Σταματησα τον server. (ΣΗΜ: το preview_screenshot πιανει παντα το top — γνωστο headless viewport quirk, οχι bug· επαληθευση μεσω DOM eval + static output.) Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx + app/globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets· η per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες· η «who»/«compare» links στο top nav (τωρα reachable μονο με scroll).

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση `ph-aros.com` ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox `hello@ph-aros.com` για τα waitlist emails.

## 2026-07-02 (cont.¹¹)

Task: (e) Polish, μερος 17 — FAQ expansion (3 νεες ερωτησεις) + Compare link στο top nav. Καθαρα self-contained content increment: μηδεν assets, μηδεν pricing decisions, brand-consistent. Οι 3 ερωτησεις καλυπτουν πραγματικα buyer gaps που δεν απαντιουνται αλλου στη σελιδα, και το Compare nav link κλεινει το navigation gap που ειχα σημειωσει (το #compare section ηταν reachable μονο με scroll).

Τι εφτιαξα:
- `app/page.tsx` FAQS: +3 entries (6 -> 9), ολα ακριβη per CLAUDE.md:
  1. «Can it read receipts and statements I already have?» — drag-drop PDF/photo AI parse + card statements + installments split across months + Gmail export bulk-import.
  2. «How do backups work?» — self-host nightly backup -> NAS + one-click JSON/CSV export + SMB/FTP/OneDrive mirror (3-2-1)· hosted = managed nightly.
  3. «Is my financial data secure?» — LAN/VPN access behind login, no public sign-up, zero telemetry.
  Το FAQ JSON-LD (mainEntity) mapαρει το FAQS array -> πηρε αυτοματα και τις 3 νεες (structured data μενει consistent).
- `app/page.tsx` top nav: νεο Compare link (href="#compare", nav-anchor) αναμεσα σε Pricing και FAQ. Reuse του υπαρχοντος nav-anchor idiom (smooth scroll ηδη υπαρχει). Μηδεν CSS αλλαγη.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup, μηδεν bundle impact).
- Prerendered HTML (.next/server/app/index.html): και οι 3 νεες ερωτησεις FOUND· href="#compare" count=2 (top nav + footer). Το route ειναι static, οποτε το prerendered HTML ειναι ακριβως αυτο που σερβιρεται (build + HTML check = ισοδυναμη επαληθευση για pure-static content). Docker/web/mobile αθικτα. Το .claude/launch.json (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση του CSS mockup (#preview) με πραγματικα app screenshots οταν υπαρξουν assets· per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες· η «who» link στο top nav (τωρα reachable μονο με scroll).

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹²)

Task: (e) Polish, μερος 18 — νεο flagship spotlight section «AI in action» (#ai) αναμεσα σε Features και Who. Το AI receipt/statement parsing ειναι το κυριο differentiator του app αλλα ζουσε μονο ως ενα feature card· του εδωσα δικη του visual στιγμη (input -> parsed output), ολα CSS-drawn (μηδεν screenshot assets, ιδιο idiom με το υπαρχον #preview mockup). Self-contained, brand-consistent, μηδεν pricing/asset dependency.

Τι εφτιαξα:
- `app/page.tsx`: νεα data arrays (AI_FIELDS store/date/VAT/total, AI_LINES 2 line items, AI_NOTES 3 chips) + νεο `#ai` section: eyebrow «AI that reads your paperwork» + h2 «Drop a receipt. Get structured data.» + subtext + `.ai-flow` (input panel με faux-receipt fuzzy lines + file chip «receipt_plaisio.pdf» -> `.ai-arrow` -> output panel με 4 parsed fields [Πλαίσιο Computers / 22 Nov 2023 / VAT / €149.50 accent] + 2 line items με check icons) + 3 note chips (any language / line items+VAT split / quick-verify queue). Semantic, μηδεν client JS. Values ακριβη per CLAUDE.md (το πραγματικο Πλαίσιο €149.50 22/11/2023 example απο το OCR-rotation finding).
- `app/page.tsx` top nav: νεο «AI» link (href="#ai", nav-anchor) αναμεσα σε Features και Self-host. Το `.nav-anchor` κρυβεται <720px, οποτε μηδεν mobile crowding.
- `app/globals.css`: νεες `.ai-flow` (3-col grid 1fr/auto/1fr) + `.ai-panel`/`.ai-panel-out` (accent radial glow, ιδιο pattern με showcase/cta-band) + `.ai-receipt`/`.ai-rline` (dashed faux-receipt με width utility classes w-30..w-80) + `.ai-file` + `.ai-arrow` (round accent badge, rotate -90 desktop) + `.ai-fields`/`.ai-field` + `.ai-lines`/`.ai-lineitem` + `.ai-notes`/`.ai-note` chips. Reuse υπαρχουσας παλετας/glow idiom. Responsive: <720px το `.ai-flow` γινεται single-col + arrow rotate 0 (points down)· #ai padding 40px στο 480px block.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (.next/server/app/index.html): «Drop a receipt. Get structured data.», «AI that reads your paperwork», id="ai", receipt_plaisio.pdf, «Line items, VAT», «Πλαίσιο Computers» ολα FOUND· href="#ai" nav count=1.
- Preview (landing-dev, port 3100): DOM eval -> #ai present, h2 σωστο, 2 panels / 4 fields / 2 line items / 3 notes, nav AI link present· console errors: none. Σταματησα τον server. (ΣΗΜ: το headless viewport εχει innerWidth=0 -> εφαρμοζεται το <720px stacking rule, γνωστο quirk· το desktop 3-col rule ειναι εγκυρο CSS, επιβεβαιωμενο απο build + DOM structure.) Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx + app/globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση των CSS mockups (#preview, #ai) με πραγματικα app screenshots οταν υπαρξουν assets· per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες· «who» link στο top nav (τωρα reachable μονο με scroll).

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹³)

Task: (e) Polish, μερος 19 — «Who» link στο top nav. Το #who section («Who it's for», personas) ηταν reachable μονο με scroll· ηταν το τελευταιο navigation gap που ειχα σημειωσει επαναληπτικα στα προηγουμενα entries. Καθαρο one-line increment, μηδεν assets, μηδεν pricing decision.

Τι εφτιαξα:
- `app/page.tsx` top nav: νεο «Who» link (href="#who", nav-anchor) αναμεσα σε AI και Self-host, ωστε η σειρα του nav να ακολουθει τη σειρα αναγνωσης της σελιδας (Features -> AI -> Who -> Self-host -> Pricing -> Compare -> FAQ). Reuse του υπαρχοντος nav-anchor idiom (smooth scroll + hide <720px, οποτε μηδεν mobile crowding). Μηδεν CSS αλλαγη.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ First Load JS 102 kB shared, αμεταβλητο — pure static markup, μηδεν bundle impact).
- Prerendered HTML (.next/server/app/index.html): href="#who" count=1 (νεο nav link). Το route ειναι static, οποτε το prerendered HTML ειναι ακριβως αυτο που σερβιρεται (build + HTML check = ισοδυναμη επαληθευση για pure-static content — δεν χρειαστηκε preview server για ενα nav anchor). Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο app/page.tsx + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — το top nav ειναι πλεον πληρες (ολα τα major sections reachable)· αντικατασταση των CSS mockups (#preview, #ai) με πραγματικα app screenshots οταν υπαρξουν assets· per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹⁴)

Task: (c/e) Polish, μερος 20 — νεο section «Integrations / Works with your stack» (#integrations) αναμεσα σε AI και Who. Οι integrations (OneDrive/SMB/FTP local storage, multi-provider AI, Gmail import, UniFi/ntfy alerts) ειναι απο τα δυνατοτερα differentiators του app (βαρια στο CLAUDE.md) αλλα δεν εμφανιζονταν πουθενα ως δικη τους ενοτητα — μονο σκορπια σε feature cards. Self-contained content increment: μηδεν assets, μηδεν pricing decision, brand-consistent (ιδιο glow/pill idiom με deploy-strip + feature cards).

Τι εφτιαξα:
- `app/page.tsx`: νεο `INTEGRATIONS` array (4 groups × icon+color): Storage & backup (Local disk/SMB·SMB3/FTP·FTPS/OneDrive/Nightly archive), Bring your own AI (Ollama local/Anthropic/OpenAI/Gemini/OpenRouter), Import & export (Gmail export/PDF·image OCR/CSV/JSON backup), Network & alerts (UniFi monitoring/Speedtest/ntfy/Price-drop alerts). Ολα ακριβη per CLAUDE.md (lib/aiProviders, lib/onedrive, lib/unifi, lib/notify, Gmail takeout pipeline). Νεο `#integrations` section: eyebrow «Works with your stack» + h2 «Plugs into what you already run» + subtext + `.integ-grid` (2-col cards, ενα ανα group, με icon badge + pill ανα integration).
- `app/globals.css`: νεες `.integ-grid` (2-col, single-col <640px) + `.integ-group` card + `.integ-head`/`.integ-icon`/`.integ-glow` (ιδιο radial glow pattern με feature-icon) + `.integ-pills`/`.integ-pill`/`.integ-dot` (per-group color dot, reuse deploy-pill styling). Reuse υπαρχουσας παλετας.
- ΔΕΝ προσθεσα nav link (το top nav ειναι ηδη πληρες με 7 anchors· #integrations reachable με scroll οπως τα #trust/#preview που επισης δεν εχουν nav link — αποφυγη overcrowding).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (.next/server/app/index.html): «Plugs into what you already run», «Works with your stack», id="integrations", «Ollama (local)», «UniFi monitoring», «OneDrive» ολα FOUND. Route static -> prerendered HTML = ακριβως το served (build + HTML check = ισοδυναμη επαληθευση για pure-static content). Docker/web/mobile αθικτα. Το `.claude/launch.json` + `apps/web/SAAS_PROGRESS.md` (foreign, modified απο αλλα routines) ΔΕΝ commit (collision guard — μονο app/page.tsx + app/globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση των CSS mockups (#preview, #ai) με πραγματικα app screenshots οταν υπαρξουν assets· per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹⁵)

Task: (c/e) Polish, μερος 21 — νεο section «Mobile app» (#mobile) αναμεσα σε Integrations και Who. Το apps/mobile (Expo, native iOS/Android) ειναι πραγματικο και βαρια αναπτυγμενο (15+ screens: home/shopping/receipts/tasks/money/subscriptions/items/assistant/vouchers/statements/calendar/reports/settings/search/activity, camera product scan, push notifications, expo-secure-store token, login στον δικο σου server) αλλα ΔΕΝ αναφερονταν πουθενα στο landing (grep mobile=0). Δυνατο, factual differentiator· του εδωσα δικη του ενοτητα με CSS-drawn phone mockup (ιδιο idiom με #preview/#ai, μηδεν screenshot assets).

Τι εφτιαξα:
- `app/components/Icon.tsx`: 3 νεα stroke icons (phone, camera, bell) στο PATHS map. Ακολουθουν το ' M'-split idiom (καθε subpath ξεκιναει με M).
- `app/page.tsx`: νεα data arrays `MOBILE_HIGHLIGHTS` (4: Scan on the spot/camera, Push notifications/bell, Talks to your server/server [secure enclave, LAN/VPN], The whole hub/package) + `MOBILE_NAV` (6 module icons για το mockup). Νεο `#mobile` section: eyebrow «Take it with you» + h2 «The hub, in your pocket» + subtext (native iOS+Android, Expo, signs in to your own server) + `.mobile-flow` (phone mockup + 2×2 highlights grid). Το phone: notch + status bar (9:41 / «Pharos» accent) + greeting (Good evening / 3 alerts) + 2 stat tiles (Owed €1,149 gold / This month €612 accent) + 6-icon nav row + accent «Scan a product» CTA με camera icon. Ολα ακριβη per CLAUDE.md/apps-mobile README.
- `app/page.tsx` top nav: νεο «Mobile» link (href="#mobile", nav-anchor) αναμεσα σε AI και Who (reading order: Features -> AI -> Mobile -> Who -> Self-host -> Pricing -> Compare -> FAQ). Nav-anchor κρυβεται <720px -> μηδεν mobile crowding.
- `app/globals.css`: νεες `.mobile-flow` (2-col auto/1fr, στοιβαζει <900px) + `.phone`/`.phone-notch`/`.phone-screen` (accent glow shadow, ιδιο pattern με showcase) + `.phone-status`/`.phone-greet`/`.phone-stats`/`.phone-tile`/`.phone-nav`/`.phone-nav-ico`/`.phone-cta` + `.mobile-highlights` (2-col -> 1-col <560px)/`.mobile-highlight` (reuse feature-icon/feature-glow). Reuse υπαρχουσας παλετας/glow idiom.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (.next/server/app/index.html): id="mobile"=1, «The hub, in your pocket», «Take it with you», «Scan on the spot», «Talks to your server», «Scan a product» ολα FOUND· href="#mobile" nav count=1. Route static -> prerendered HTML = ακριβως το served (build + HTML check = ισοδυναμη επαληθευση για pure-static content). Δεν σηκωσα preview server (μονο νεο section με reuse CSS idioms). Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config) ΔΕΝ commit (collision guard — μονο Icon.tsx + page.tsx + globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση των CSS mockups (#preview, #ai, #mobile phone) με πραγματικα app screenshots οταν υπαρξουν assets· per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹⁶)

Task: (c/e) Polish, μερος 22 — νεο slim «By the numbers» proof band (#numbers) αναμεσα σε #preview και #features. Και τα δυο next-increment items του προηγουμενου log ηταν blocked (πραγματικα app screenshots = χρειαζονται assets· per-plan Offer JSON-LD = χρειαζονται τελικες τιμες), οποτε διαλεξα φρεσκο (e) increment: μια συμπαγη μπαρα με 5 factual figures που ενισχυει τα differentiators αμεσως μετα το dashboard preview (marketing flow: dashboard -> app σε νουμερα -> feature-by-feature). Ολα τα νουμερα αληθινα/derivable απο το app: 8 modules (=FEATURES), 6 AI providers (Ollama/Anthropic/OpenAI/Gemini/OpenRouter/Custom per CLAUDE.md), 4 storage backends (Local/SMB/FTP/OneDrive), 0 telemetry, ∞ Yours to keep · AGPL-3.0. Self-contained, μηδεν assets, μηδεν pricing decision.

Τι εφτιαξα:
- `app/page.tsx`: νεο `STATS` array (5 × num+lbl+color) + νεο `#numbers` section (`.numbers-band` με 5 `.number-tile`, καθε ενα με radial `.num-glow` στο brand color + big display num + label). Τοποθετηθηκε αναμεσα στο product showcase και τα features.
- `app/globals.css`: νεες `.numbers-band` (5-col grid -> 3-col <900px -> 2-col <560px), `.number-tile` (surface card, hover lift + border-light, ιδιο idiom με stat-tile/deploy-pill), `.number-tile .num` (display 800, brand color), `.lbl` (dim), `.num-glow` (radial blur, reuse feature-glow pattern). Reuse υπαρχουσας παλετας.
- ΔΕΝ προσθεσα nav link (slim band, reachable με scroll οπως τα #trust/#preview/#integrations που επισης δεν εχουν nav link· το top nav ειναι ηδη πληρες με 8 anchors, αποφυγη overcrowding).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ 761 B / 103 kB First Load JS, αμεταβλητο — pure static markup+CSS, μηδεν bundle impact).
- Prerendered HTML (.next/server/app/index.html): id="numbers"=1, «Modules in one hub», «AI providers, your pick», «Storage backends», «Trackers or telemetry», «Yours to keep» ολα FOUND. Route static -> prerendered HTML = ακριβως το served (build + HTML check = ισοδυναμη επαληθευση για pure-static content· δεν σηκωσα preview server για slim static band με reuse CSS idioms). Docker/web/mobile αθικτα. Το `.claude/launch.json` (shared local config, modified) ΔΕΝ commit (collision guard — μονο page.tsx + globals.css + LANDING_PROGRESS.md).

Επομενο increment: (e) συνεχεια — αντικατασταση των CSS mockups (#preview, #ai, #mobile phone) με πραγματικα app screenshots οταν υπαρξουν assets· per-plan Offer JSON-LD nodes οταν κλεισουν οι τιμες· mobile hamburger menu (το top nav κρυβει τα secondary anchors <720px, δουλευει αλλα ενα drawer θα εδινε πληρη mobile nav).

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (το SITE_URL σε layout/page/robots/sitemap/JSON-LD το χρησιμοποιει).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹⁷)

Task: (e) Polish, μερος 23 — mobile hamburger drawer. Ηταν το ρητο «επομενο increment» του προηγουμενου log (τα αλλα δυο, real screenshots + per-plan Offer JSON-LD, μενουν blocked σε assets/τιμες). Προβλημα: <720px το top nav εκρυβε ΟΛΑ τα `.nav-anchor` (Features/AI/Mobile/Who/Self-host/Compare/FAQ), αφηνοντας μονο Pricing + GitHub -> τα 7 sections αναζητησιμα μονο με χειροκινητο scroll σε κινητο. Τωρα ενα drawer τα επαναφερει ολα.

Τι εφτιαξα:
- `app/components/MobileNav.tsx` (νεο, client component, ιδιο idiom με Waitlist): hamburger button (aria-label/aria-expanded/aria-controls) + slide-in drawer απο δεξια. `ITEMS` array κρατιεται σε sync με το desktop <nav> (8 anchors) + GitHub link. useEffect: body scroll-lock + Escape-to-close οσο ειναι open. Close σε: scrim click, close button (X), καθε link click. Hamburger + X icons ζωγραφισμενα inline SVG (το Icon.tsx δεν εχει menu/close glyph).
- `app/page.tsx`: import + `<MobileNav githubUrl={GITHUB_URL} />` μεσα στο header, διπλα στο desktop <nav>.
- `app/globals.css`: `.nav-burger` (default display:none -> desktop hidden· hover border/bg), `.mobile-drawer` (fixed inset, z-index 60), `.drawer-scrim` (rgba scrim + blur, fade-in keyframe), `.drawer-panel` (right slide-in min(80vw,320px), slide keyframe, left border + shadow), `.drawer-head`, `.drawer-link` (13px touch targets, hover bg). Reduced-motion ηδη καλυπτεται απο το global `@media (prefers-reduced-motion)` block (animation: none). Reuse υπαρχουσας παλετας.
- Media <720px: αλλαξε απο «`.nav-anchor { display:none }`» σε «`.site-nav { display:none }` + `.nav-burger { display:inline-flex }`» -> desktop links φευγουν εντελως, εμφανιζεται το hamburger. (Το `.nav-anchor` class μενει στα anchors αλλα αχρησιμοποιητο CSS-wise· αβλαβες.)

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success. Route / = 1.41 kB / 104 kB First Load JS (ηταν 761 B / 103 kB· +~650 B γιατι το MobileNav ειναι client component -> μικρο hydration bundle. Ολα ακομα ○ Static/prerendered).
- Prerendered HTML (.next/server/app/index.html): nav-burger / mobile-drawer / drawer-panel / «Open menu» / drawer-link ολα FOUND (client component renders initial state στο SSR: burger + hidden drawer markup).
- Dev smoke: `npm run dev` -> «Ready» καθαρο, 0 errors, στο :3001 (το :3000 το κραταει το Docker homepage-web· δεν το πειραξα). Server σταματημενος (pkill next), δεν αφησα κανενα να τρεχει. Docker/web/mobile αθικτα.
- Collision guard: git status -> κανενα staged απο αλλο routine· foreign `.claude/launch.json` (modified) ΔΕΝ commit — μονο MobileNav.tsx + page.tsx + globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως active-section highlight στο drawer (scroll-spy) ή focus-trap μεσα στο drawer για πληρη a11y.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹⁸)

Task: (e) Polish, μερος 24 — focus-trap + focus management στο mobile drawer. Ηταν το ρητο «επομενο increment» του προηγουμενου log (τα αλλα δυο, real screenshots + per-plan Offer JSON-LD, μενουν blocked σε assets/τιμες). Προβλημα a11y: το drawer ανοιγε αλλα το keyboard focus εμενε πισω στη σελιδα (Tab ξεφευγε κατω απ' το scrim, keyboard/screen-reader users χανονταν) και μετα το κλεισιμο το focus δεν επεστρεφε στο hamburger. Τωρα το drawer ειναι πληρως keyboard-navigable.

Τι εφτιαξα (μονο `app/components/MobileNav.tsx`):
- 3 refs: `burgerRef` (trigger), `panelRef` (drawer nav), `closeRef` (X button).
- On open: `requestAnimationFrame` -> focus στο close button (focus μπαινει μεσα στο drawer).
- Focus-trap στο `onKey` (Tab/Shift+Tab): `focusable()` μαζευει τα ορατα a[href]/button μεσα στο panel· Tab στο last -> wrap στο first, Shift+Tab στο first (ή focus εκτος panel) -> wrap στο last. Escape κλεινει (ηδη υπηρχε).
- On close (cleanup): `burgerRef.current?.focus()` -> return focus στο trigger (WCAG 2.4.3 focus order).
- Το scrim button (tabIndex=-1, εκτος panelRef) σωστα εξαιρειται απο το trap.
- Μηδεν CSS/markup αλλαγη πλην των ref attachments· καμια αλλη component/αρχειο δεν αγγιχτηκε.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success. Route / = 1.7 kB / 104 kB First Load JS (ηταν 1.41 kB· +~290 B για refs+trap logic στο client component· ολα ○ Static/prerendered).
- Prerendered HTML: mobile-drawer / drawer-panel / «Open menu» ολα FOUND (SSR initial state αμεταβλητο).
- Dev smoke: `PORT=3007 npm run dev` -> HTTP 200, 0 errors στο log· server σταματημενος (pkill), δεν αφησα κανενα να τρεχει (το :3000 το κραταει το Docker homepage-web). Docker/web/mobile αθικτα.
- Collision guard: git status -> κανενα foreign staged· foreign `.claude/launch.json` (modified) ΔΕΝ commit — μονο MobileNav.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως scroll-spy active-section highlight στο drawer/desktop nav.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (ή mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.¹⁹)

Task: (e) Polish, μερος 25 — scroll-spy active-section highlight στο nav. Ηταν το ρητο «επομενο increment» του προηγουμενου log (real screenshots + per-plan Offer JSON-LD μενουν blocked σε assets/τιμες). Προβλημα: το top nav (desktop + drawer) δεν εδειχνε πουθενα «που βρισκεσαι» καθως ο αναγνωστης scroll-αρει τα 8 sections· τωρα ο ενεργος συνδεσμος φωτιζεται accent.

Τι εφτιαξα:
- `app/components/ScrollSpy.tsx` (νεο, client component, renders null): useEffect μαζευει ολα τα `a.navlink[href^="#"]` + `a.drawer-link[href^="#"]`, τα χαρτογραφει ανα section id (ενα section μπορει να εχει anchor και στο desktop nav και στο drawer), και ενα IntersectionObserver με `rootMargin: -48% 0 -48% 0` (λεπτη ζωνη στο κεντρο του viewport) toggle-αρει `.nav-active` + `aria-current="true"` στους matching anchors. Οταν πανω απο ενα section ειναι στη ζωνη, διαλεγει αυτο που το top edge ειναι πλησιεστερα στο κεντρο. Graceful no-op αν λειπουν anchors/sections. SECTIONS array κρατιεται σε sync με το <nav> (page.tsx) + drawer ITEMS (MobileNav.tsx).
- `app/page.tsx`: import + `<ScrollSpy />` αμεσως μετα το </header>.
- `app/globals.css`: `.navlink.nav-active, .drawer-link.nav-active { color: var(--accent) }` διπλα στους navlink κανονες.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success. Route / = 2.18 kB / 105 kB First Load JS (ηταν 1.7 kB / 104 kB· +~480 B για το client ScrollSpy chunk· ολα ○ Static/prerendered).
- Prerendered HTML (.next/server/app/index.html): site-nav + drawer-panel FOUND, «nav-active» ΑΠΩΝ στο SSR (σωστο — εφαρμοζεται μονο runtime στο scroll, καμια αλλαγη στο initial markup).
- Δεν αφησα κανενα dev server (pgrep «next dev» -> none). Το :3000 το κραταει το Docker homepage-web· δεν το πειραξα. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> μονο τα δικα μου paths· foreign `.claude/launch.json` (modified) ΔΕΝ commit.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως smooth-scroll offset για το sticky header ή prefers-reduced-motion guard στο scroll behavior.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.²⁰)

Task: (e) Polish, μερος 26 — scroll-margin-top offset για το sticky header. Ηταν το ρητο «επομενο increment» του προηγουμενου log (real screenshots + per-plan Offer JSON-LD μενουν blocked σε assets/τιμες). Προβλημα: το header ειναι `position: sticky; top:0; height:64px`. Καθε κλικ σε nav anchor (#features, #ai, #pricing, ...) εκανε jump με το section top στο top:0 -> το sticky header σκεπαζε τους πρωτους ~64px καθε section (ο τιτλος του section κρυβοταν απο κατω). Ιδιο και για το ScrollSpy landing απο external #hash. Τωρα ο anchor στοχος προσγειωνεται καθαρα κατω απο το header.

Τι εφτιαξα (μονο `app/globals.css`, μια regla):
- `section[id] { scroll-margin-top: 80px }` διπλα στο υπαρχον `html { scroll-behavior: smooth }` block. Ολα τα scroll targets ειναι `<section id="...">` (top/preview/features/ai/mobile/who/self-host/pricing/compare/faq/waitlist) -> ενας attribute selector τα καλυπτει ολα χωρις να αγγιξω τα inline styles καθε section. 80px = 64px header + 16px breathing room. Δουλευει και με smooth-scroll και με reduced-motion (το scroll-margin ειναι ανεξαρτητο απ' το scroll-behavior:auto override στο :1298).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success. Route / = 2.18 kB / 105 kB First Load JS (αμεταβλητο· pure CSS, μηδεν JS delta).
- Compiled CSS (.next/static/css/*.css): `scroll-margin-top:80px` FOUND.
- Δεν αφησα κανενα dev server. Το :3000 το κραταει το Docker homepage-web· δεν το πειραξα. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status -> foreign `.claude/launch.json` + `PROGRESS.md` (modified, αλλα ΑΣΤΑΓΑ, αλλης ρουτινας) ΔΕΝ commit — μονο globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως prefers-reduced-motion σεβασμος στο ScrollSpy ή lazy-load των mockup blocks.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-02 (cont.²¹)

Task: (e) Polish, μερος 27 — branded 404 page (`app/not-found.tsx`). Το app δεν ειχε custom not-found -> καθε λαθος URL εδειχνε το γενικο default Next 404, off-brand. Ηταν φρεσκο self-contained increment: μηδεν assets, μηδεν pricing decision, brand-consistent (reuse του hero idiom + υπαρχουσων CSS classes, μηδεν globals.css αλλαγη -> ελαχιστο collision surface, ενα νεο αρχειο).

Τι εφτιαξα:
- `app/not-found.tsx` (νεο, server component): centered full-height layout με PharosMark 64px + mono eyebrow «Error 404 · off the map» + clamp() gradient headline «No light this way.» (ιδια accent→cyan→purple βαφη με το hero) + subcopy («let the beacon guide you back») + 2 CTA κουμπια «Back to home» (-> /) + «Self-host it free» (-> GITHUB_URL). Reuse υπαρχουσων `.container`/`.btn`/`.btn-primary`/`.btn-ghost`/`.mono` classes + inline styles (ιδιο pattern με το hero), οποτε ΜΗΔΕΝ globals.css αλλαγη. Metadata: title «Page not found · PHAROS» + `robots: { index:false, follow:false }` (τα 404 δεν indexαρονται).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· το `/_not-found` route τωρα ○ (Static) prerendered 138 B (πριν = default Next 404)· / αμεταβλητο 2.18 kB / 105 kB.
- Prerendered HTML (`.next/server/app/_not-found.html`): «No light», «Error 404», «off the map», «Back to home», «beacon guide» ολα FOUND. Route static -> prerendered HTML = ακριβως το served (build + HTML check = ισοδυναμη επαληθευση για pure-static content με reuse CSS idioms· δεν σηκωσα preview server). Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status -> foreign `.claude/launch.json` (modified, ασταγο, αλλης ρουτινας) ΔΕΝ commit — μονο app/not-found.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως custom error boundary (app/error.tsx) η prefers-reduced-motion σεβασμος στο ScrollSpy.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03

Task: (e) Polish, μερος 28 — branded error boundary (`app/error.tsx`). Ηταν ρητη προταση απο το προηγουμενο log (custom error boundary η prefers-reduced-motion)· το διαλεξα γιατι ειναι φυσικος συντροφος του `not-found.tsx` (cont.²¹): μηδεν assets, μηδεν pricing decision, brand-consistent, ενα νεο αρχειο (ελαχιστο collision surface, καμια globals.css αλλαγη). Το app δεν ειχε κανενα error boundary -> καθε runtime exception εδειχνε το γενικο default Next error, off-brand και χωρις recovery.

Τι εφτιαξα:
- `app/error.tsx` (νεο, client component οπως απαιτει το App Router· δεχεται `error` + `reset`): centered layout (min-height 70vh ωστε να μενει το layout header/footer ορατο) με PharosMark 64px + mono eyebrow «Error · the beacon flickered» + clamp() gradient headline «Something went dark.» (ιδια accent→cyan→purple βαφη με hero/404) + subcopy + optional `error.digest` reference line (μονο αν υπαρχει) + 3 CTA: **«Try again»** (button -> `reset()`, το recovery που το στατικο 404 δεν εχει) + «Back to home» (/) + «Self-host it free» (GitHub). `useEffect` -> `console.error` ωστε να μη χανεται σιωπηλα το σφαλμα. Reuse υπαρχουσων `.container`/`.btn`/`.btn-primary`/`.btn-ghost`/`.mono` classes -> ΜΗΔΕΝ globals.css αλλαγη. Επιβεβαιωσα οτι το `.btn` base κανει σωστο reset σε `<button>` (explicit background απο btn-primary, border/cursor/font-family/focus-visible ολα καλυμμενα στο globals.css:198-227,1293).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success. Το error.tsx ειναι boundary, ΟΧΙ route -> δεν εμφανιζεται νεο route entry (bundle-αρεται στο client boundary)· / αμεταβλητο 2.18 kB / 105 kB First Load JS, ολα ○ Static. Verification = type-check + build (ιδιο pattern με ολα τα προηγουμενα increments)· το boundary πυροδοτειται μονο σε runtime exception, μη παρατηρησιμο σε στατικο preview -> δεν σηκωσα dev server (ουτε αγγιξα το Docker :3000). Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο app/error.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως prefers-reduced-motion σεβασμος στο ScrollSpy (IntersectionObserver δεν κανει scroll animation, οποτε low priority) ή global-error.tsx για σφαλματα στο ιδιο το root layout.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.)

Task: (e) Polish, μερος 29 — root-level error boundary (`app/global-error.tsx`). Ηταν ρητη προταση απο το προηγουμενο log (global-error.tsx για σφαλματα στο ιδιο το root layout). Φυσικος συντροφος του error.tsx (cont.²⁸) + not-found.tsx (cont.²¹): μηδεν assets, μηδεν pricing decision, ενα νεο αρχειο. Το app ειχε μονο segment-level error boundary (error.tsx)· αν πεταξει το ιδιο το root layout, το error.tsx ΔΕΝ πιανεται (ειναι μεσα στο layout) -> εδειχνε το γενικο default Next global error, off-brand και χωρις recovery.

Τι εφτιαξα:
- `app/global-error.tsx` (νεο, client component οπως απαιτει το App Router· δεχεται `error`+`digest` + `reset`). ΚΡΙΣΙΜΗ διαφορα απο το error.tsx: το global-error ΑΝΤΙΚΑΘΙΣΤΑ ολοκληρο το root layout -> το `globals.css` ΔΕΝ φορτωνεται και πρεπει να renderαρει δικο του `<html>/<body>`. Οποτε ολα ειναι fully self-contained inline styles με hardcoded brand values (#0a0a0a bg, #f5f5f5 text, #00ff88 accent, accent→cyan→purple gradient headline, #999/#666 dims) — καμια εξαρτηση απο CSS variables/`.btn`/`.mono` classes που δεν υπαρχουν εδω. Reuse του PharosMark (64px): επειδη χρησιμοποιει `var(--accent)`/`var(--bg)`, set τα δυο vars inline ΜΟΝΟ στο `<body>` ωστε να resolvαρουν. Font stack με Manrope/IBM Plex Mono + system fallbacks (τα @font imports ζουν στο globals.css που δεν φορτωνεται). 3 CTA: **«Try again»** (button -> `reset()`, recovery) + «Back to home» (/) + «Self-host it free» (GitHub). `useEffect` -> `console.error` ωστε να μη χανεται σιωπηλα.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success. Το global-error.tsx ειναι boundary (οπως το error.tsx), ΟΧΙ route -> δεν εμφανιζεται νεο route entry (bundle-αρεται στο client boundary chunk)· / αμεταβλητο 2.18 kB / 105 kB First Load JS, ολα 8 routes ○ Static. Verification = type-check + build (ιδιο pattern με ολα τα προηγουμενα increments)· το boundary πυροδοτειται μονο σε runtime root-layout exception, μη παρατηρησιμο σε στατικο preview -> δεν σηκωσα dev server (ουτε αγγιξα το Docker :3000). Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `MOBILE_PARITY.md` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο app/global-error.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως prefers-reduced-motion σεβασμος στο ScrollSpy ή lazy-load των mockup blocks. Το error-handling triad (not-found + error + global-error) ειναι πλεον πληρες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.²)

Task: (e) Polish, μερος 30 — skip-to-content link (a11y). Το app ειχε `<main>` landmark + focus-visible rings + reduced-motion + sr-only, αλλα ΟΧΙ skip link -> keyboard/screen-reader χρηστες αναγκαζονταν να κανουν tab μεσα απο ολο το nav (8 links + GitHub + MobileNav) πριν φτασουν στο περιεχομενο. Φρεσκο, self-contained increment: μηδεν assets, μηδεν pricing decision, brand-consistent, καμια νεα εξαρτηση.

Τι εφτιαξα:
- `app/page.tsx`: skip link `<a href="#top" className="skip-link">Skip to content</a>` ως ΠΡΩΤΟ παιδι του `<main>` (πριν το JSON-LD script -> πρωτο focusable στοιχειο στο tab order). Το hero `<section id="top">` πηρε `tabIndex={-1}` + `outline:'none'` ωστε το focus να προσγειωνεται εκει προγραμματικα οταν πατηθει ο skip link (τα section elements δεν ειναι focusable by default -> χωρις αυτο ο screen reader δεν θα μετεφερε το focus, μονο θα scrollαρε).
- `app/globals.css`: νεα `.skip-link` class (position:fixed, top:-80px off-screen· :focus -> top:16px slide-in, accent bg #00ff88 + dark text #05130b για contrast, mono font, box-shadow, brand-consistent). Τοποθετηθηκε στο a11y block διπλα στο focus-visible ring (μηδεν αλλαγη σε υπαρχοντες selectors). Το reduced-motion global transition-override ηδη ουδετεροποιει το slide για οσους το ζητουν.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 8 routes ○ Static· / αμεταβλητο 2.18 kB / 105 kB First Load JS (καθαρα markup/CSS, μηδεν JS).
- Prerendered HTML (`.next/server/app/index.html`): `skip-link">Skip to content` FOUND + `id="top" tabindex="-1"` FOUND. Route static -> prerendered HTML = ακριβως το served (build + HTML grep = ισοδυναμη επαληθευση για pure-static markup/CSS)· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο app/page.tsx + app/globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως «back to top» button η lazy-load των mockup blocks. Το a11y triad (skip-link + focus-visible + reduced-motion) πληρες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.³)

Task: (e) Polish, μερος 31 — floating «back to top» button (`app/components/BackToTop.tsx`). Ηταν ρητη προταση απο το προηγουμενο log («back to top» button η lazy-load). Το διαλεξα γιατι ειναι φυσικος συντροφος του ScrollSpy + skip-link (a11y/navigation triad): μηδεν assets, μηδεν pricing decision, brand-consistent, ενα νεο component + μια CSS class. Το site εχει 16 sections (~long scroll) αλλα καμια γρηγορη επιστροφη στην κορυφη — ο χρηστης αναγκαζοταν να scrollαρει χειροκινητα.

Τι εφτιαξα:
- `app/components/BackToTop.tsx` (νεο, client component): fixed κουμπι κατω-δεξια με inline up-chevron SVG (ιδιο stroke idiom με το Icon.tsx, strokeWidth 1.8). Κρυφο μεχρι `window.scrollY > 800` (περιπου μετα το hero), μετα fade-in. Scroll listener με `requestAnimationFrame` throttle + `{passive:true}` (μηδεν jank). Click -> `window.scrollTo({top:0})` με `behavior` που σεβεται το `prefers-reduced-motion` (matchMedia -> 'auto' αλλιως 'smooth') + μεταφερει focus στο `#top` (`focus({preventScroll:true})`) ωστε ο screen reader να ανακοινωσει το jump (reuse του `tabIndex={-1}` που εβαλε το skip-link cont.²). a11y: `aria-label="Back to top"`, `aria-hidden` + `tabIndex` toggle οταν κρυφο (ΔΕΝ ειναι tab-target οσο αορατο). Progressive enhancement: no-op σε SSR, degrade αν λειπει το #top.
- `app/globals.css`: νεα `.back-to-top` class (46px circle, surface-2 bg + border-light, box-shadow) + `.back-to-top-on` (opacity/translateY reveal, pointer-events auto) + hover (accent bg + dark chevron + accent glow, ιδιο idiom με τα `.btn-primary`). Reuse υπαρχουσων vars (--surface-2/--border-light/--text-dim/--accent/--bg). Τοποθετηθηκε στο a11y block πριν το focus-visible ring (μηδεν αλλαγη σε υπαρχοντες selectors). Το reduced-motion global transition-override ηδη ουδετεροποιει το fade/slide.
- `app/page.tsx`: import + mount `<BackToTop />` διπλα στο `<ScrollSpy />` (μετα το header).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 8 routes ○ Static· / = 2.43 kB (πριν 2.18) / 105 kB First Load JS (η μικρη αυξηση = το νεο client component chunk· ολα τα υπολοιπα routes αμεταβλητα).
- Prerendered HTML (`.next/server/app/index.html`): `back-to-top" aria-label="Back to top"` FOUND στο σωστο baseline hidden state (χωρις `-on` class -> κρυφο μεχρι scroll, οπως αναμενεται). Το interactive reveal/scroll τρεχει μονο client-side· verification = type-check + build + HTML grep (ιδιο pattern με το ScrollSpy client component)· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο BackToTop.tsx + globals.css + page.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως lazy-load των mockup blocks η prefers-reduced-motion σεβασμος στο ScrollSpy (χαμηλη προτεραιοτητα, IntersectionObserver δεν κανει animation). Navigation/a11y triad (skip-link + ScrollSpy + back-to-top) πληρες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.⁴)

Task: (e) Polish, μερος 32 — copy-to-clipboard κουμπι στο self-host Docker quickstart (`app/components/CopyButton.tsx`). Ρητη προταση απο προηγουμενα logs για interaction polish. Το διαλεξα γιατι ειναι το φυσικο επομενο για το OSS κοινο: το #self-host section δειχνει το `docker compose` quickstart σε `<pre>` χωρις καμια affordance για αντιγραφη -> ο χρηστης επρεπε να το επιλεξει χειροκινητα. Μηδεν assets, μηδεν pricing decision, brand-consistent, ενα νεο client component + μια CSS class.

Τι εφτιαξα:
- `app/components/CopyButton.tsx` (νεο, client component): δεχεται `text` prop (τα raw commands, ξεχωριστα απο το colour-tokenised markup του `<pre>`), copy μεσω `navigator.clipboard.writeText`, flip σε «Copied» confirmation (check icon) για 1.8s με cleanup του timer στο unmount. **Progressive enhancement**: mount-αρει (returns null) μονο οταν υπαρχει Clipboard API -> no-JS/SSR readers βλεπουν το code κανονικα, απλα χωρις το κουμπι. try/catch γυρω απο το write (μπορει να απορριφθει σε insecure context/permissions) -> fail quietly, το code μενει ορατο για manual selection. Copy/check SVG icons με το ιδιο stroke idiom (strokeWidth 1.8) οπως BackToTop/Icon. a11y: dynamic `aria-label` (copy vs copied).
- `app/page.tsx`: νεα `QUICKSTART_COMMANDS` const (τα raw commands, kept-in-sync με το `<pre>`, χτισμενη απο το `GITHUB_URL` ωστε να μη διχαζεται το URL) + wrap του `<pre>` σε `.code-wrap` (position:relative) με `<CopyButton>` pinned top-right + import.
- `app/globals.css`: `.code-wrap` (relative) + `.copy-btn` (absolute top-right, surface-2 bg + border-light, mono 0.72rem, hover -> accent border + text) + `.copy-btn-done` (accent). Reuse υπαρχουσων vars, τοποθετηθηκε αμεσως μετα τα `.code-block` rules (μηδεν αλλαγη σε υπαρχοντες selectors). Το reduced-motion global transition-override ηδη ουδετεροποιει τα transitions.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 8 routes ○ Static· / = 2.77 kB (πριν 2.43) / 105 kB First Load JS (η αυξηση = το νεο client component chunk· ολα τα υπολοιπα routes αμεταβλητα).
- Prerendered HTML (`.next/server/app/index.html`): `code-wrap` + `Docker quick start` + `git clone ...pharos.git` FOUND (το wrapper + το code block prerendered). Το CopyButton returns null σε SSR (mounts client-side μετα το clipboard-support check) -> σωστα ΔΕΝ εμφανιζεται στο static HTML· ιδιο progressive-enhancement pattern με τα προηγουμενα client components. Verification = type-check + build + HTML grep· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο CopyButton.tsx + page.tsx + globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως lazy-load των mockup blocks. Interaction/a11y triad (skip-link + ScrollSpy + back-to-top + copy-btn) πληρες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.⁵)

Task: (e) Polish, μερος 33 — canonical URL + HowTo structured data (SEO). Καθαρο, self-contained increment (μηδεν assets, μηδεν pricing decision): δυο pure SEO προσθηκες. (α) Το layout metadata ειχε πληρη openGraph/twitter/themeColor/icons αλλα ΟΧΙ canonical -> standard best-practice που ελειπε. (β) Το JSON-LD @graph ειχε Organization/WebSite/SoftwareApplication/FAQPage αλλα οχι HowTo για το self-host quickstart -> rich-results ευκαιρια για το OSS κοινο.

Τι εφτιαξα:
- `app/layout.tsx`: `alternates: { canonical: '/' }` στο metadata. Με το `metadataBase = https://ph-aros.com` ηδη set, το '/' resolvαρει σε canonical `https://ph-aros.com` -> ενα καθαρο canonical στο <head>, αποφευγει duplicate-URL θεματα (www/trailing-slash/query params).
- `app/page.tsx`: νεο `HowTo` node στο `JSON_LD['@graph']` (`@id` = `${SITE_URL}/#self-host`) με name «Self-host PHAROS with Docker», description, inLanguage, tool [Docker, Docker Compose], και `step` array παραγομενο απο το υπαρχον `STEPS` const (map -> HowToStep με position/name/text/url) -> ΜΗΔΕΝ διχασμος του step content (single source of truth, τα 3 βηματα μενουν σε sync με το self-host section). Καμια νεα εξαρτηση, καμια globals.css αλλαγη.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 6 route entries ○ Static· / αμεταβλητο 2.77 kB / 105 kB First Load JS (καθαρο <head>/JSON-LD markup, μηδεν JS).
- Prerendered HTML (`.next/server/app/index.html`): `rel="canonical" href="https://ph-aros.com"` FOUND + `"@type":"HowTo",...,"name":"Self-host PHAROS with Docker"` FOUND + 3× `"HowToStep"` (= τα 3 STEPS). Route static -> prerendered HTML = ακριβως το served (build + HTML grep = ισοδυναμη επαληθευση για <head>/structured-data markup)· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο app/layout.tsx + app/page.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως BreadcrumbList αν προστεθει δευτερη σελιδα, η lazy-load των mockup blocks. Structured-data graph (Organization + WebSite + SoftwareApplication + FAQPage + HowTo) πλεον πληρες για single-page marketing site.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/drawer GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.⁶)

Task: (c/e) νεο content section — Roadmap. Το site ειχε ολα τα modules/pricing/compare/faq αλλα καμια εικονα momentum (τι εχει βγει, τι φτιαχνεται, τι ερχεται) — κενο για dual OSS/SaaS οπου το «ζωντανο project» ειναι σημα εμπιστοσυνης. Self-contained: μηδεν assets, μηδεν pricing decision, ενα const + ενα section + nav wiring + μια grid class. Το περιεχομενο ειναι grounded στην πραγματικη κατασταση (CLAUDE.md features + memory in-progress + BACKLOG P10-P13), οχι marketing φαντασια.

Τι εφτιαξα:
- `app/page.tsx`: νεο `ROADMAP` const (3 φασεις: **Shipped** var(--accent) = inventory/receipts-AI/statements/subs/reports/network/mobile/backups· **Building** var(--cyan) = managed multi-tenant hosted + 8-lang i18n + BYO-key AI billing· **Exploring** var(--purple) = return-window reminders / IMAP email-in / savings goals & insurance export, απο το BACKLOG). Νεο `<section id="roadmap">` αναμεσα σε #compare και #cta: 3 cards (dot χρωματιστο ανα φαση + note + check-list items reuse του `<Icon name="check">`) + footer line «open an issue on GitHub». Header navlink «Roadmap» (μετα το Compare).
- `app/components/MobileNav.tsx`: `#roadmap` entry στο ITEMS (μετα το Compare) — drawer link.
- `app/components/ScrollSpy.tsx`: 'roadmap' στο SECTIONS array (μετα 'compare') — active-highlight το νεο section.
- `app/globals.css`: `.roadmap-grid` (repeat(3,1fr), align-items:start) + `.roadmap-col` hover-lift (ιδιο idiom με .persona-card) + `.roadmap-head`/`.roadmap-dot` (10px χρωματιστη κουκιδα). Responsive collapse σε 1fr στο <=900px breakpoint (διπλα στα αλλα grids). Reuse υπαρχουσων vars· μηδεν αλλαγη σε υπαρχοντες selectors. Το reduced-motion global transition-override ηδη κανει το hover-lift instant (οπως persona/step cards).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 8 routes ○ Static· / = 2.79 kB (πριν 2.77) / 105 kB First Load JS (η μικρη αυξηση = το markup του section, μηδεν νεο JS — pure server markup).
- Prerendered HTML (`.next/server/app/index.html`): `id="roadmap"` FOUND + `Where PHAROS is headed` FOUND + `href="#roadmap"` ×2 (header + drawer) + `roadmap-col` cards + «Return-window reminders for recent buys» (backlog item) FOUND. Route static -> prerendered HTML = ακριβως το served· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο page.tsx + MobileNav.tsx + ScrollSpy.tsx + globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως roadmap-dot σε aria-hidden verify η lazy-load των mockup blocks. Content sections (features/AI/mobile/who/trust/self-host/pricing/compare/roadmap/faq) πλεον πληρη για single-page marketing site.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/roadmap GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD).
- Contact inbox hello@ph-aros.com για τα waitlist emails.
- Roadmap «Building/Exploring» περιεχομενο = grounded σε BACKLOG/memory· αν αλλαξουν οι προτεραιοτητες, edit το ROADMAP const.

## 2026-07-03 (cont.⁷)

Task: (e) Polish, μερος 34 — PWA web manifest (`app/manifest.ts`). Self-contained SEO/mobile-quality increment: μηδεν assets (reuse του υπαρχοντος `/favicon.svg`), μηδεν pricing decision, ενα νεο metadata route + μια γραμμη στο layout. Το site ειχε πληρη openGraph/twitter/canonical/JSON-LD/themeColor αλλα ΚΑΝΕΝΑ web manifest -> «Add to Home Screen» σε κινητο εδινε γενικο ονομα/χωρις brand χρωματα. Το κινητο ειναι primary use case (CLAUDE.md: «mobile-first, χρησιμοποιειται συχνα απο κινητο μεσω VPN») -> λογικο polish.

Τι εφτιαξα:
- `app/manifest.ts` (νεο, Next `MetadataRoute.Manifest` route): name «PHAROS · Personal Hub», short_name «PHAROS», description (ιδια φωνη με το layout), id/start_url/scope `/`, `display: 'standalone'`, background_color + theme_color `#0a0a0a` (ιδιο με το υπαρχον viewport.themeColor), categories [productivity, finance, utilities], lang en / dir ltr, icons -> το υπαρχον `/favicon.svg` (type image/svg+xml, sizes any, purpose any). Σερβιρεται στο `/manifest.webmanifest`.
- `app/layout.tsx`: `manifest: '/manifest.webmanifest'` στο metadata (μετα το authors, πριν το alternates) -> Next εκπεμπει αυτοματα `<link rel="manifest">` στο <head>.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· τωρα 9 route entries ολα ○ Static, νεο `/manifest.webmanifest` (140 B)· / αμεταβλητο 2.79 kB / 105 kB First Load JS (manifest = ξεχωριστο route, μηδεν JS στη σελιδα).
- Manifest body (`.next/server/app/manifest.webmanifest.body`): εγκυρο JSON με ολα τα πεδια (name/short_name/theme_color #0a0a0a/icons favicon.svg) FOUND.
- Prerendered HTML (`.next/server/app/index.html`): `rel="manifest" href="/manifest.webmanifest"` FOUND στο <head>. Route static -> prerendered = ακριβως το served (build + grep = ισοδυναμη επαληθευση για metadata route)· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο manifest.ts + layout.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως apple-touch-icon PNG (το SVG δεν το τιμα το iOS) + maskable PNG icons για πληρη PWA installability (χρειαζεται asset generation, χαμηλη προτεραιοτητα). SEO/metadata surface (canonical + OG + twitter + JSON-LD graph + manifest) πλεον πληρες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/roadmap GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD/manifest scope).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-03 (cont.⁸)

Task: (e) Polish, μερος 35 — γεννηθηκαν PNG app icons (apple-touch-icon + maskable), κλεινει το flagged PWA gap. Self-contained: μηδεν external assets (τα PNG παραγονται build-time με `next/og` ImageResponse, ιδιο pattern με το υπαρχον `opengraph-image.tsx`), μηδεν pricing decision. Το προηγουμενο manifest εδινε μονο `/favicon.svg` -> το iOS αγνοει τα SVG favicons στο «Add to Home Screen» + οι Android launchers θελουν raster icon για masking. Το κινητο ειναι primary use case (CLAUDE.md).

Τι εφτιαξα:
- `app/apple-icon.tsx` (νεο, next/og route): 180×180 PNG, lighthouse mark σε brand bg (#0a0a0a) + accent glow (#00ff88). Full-bleed background γιατι το iOS βαζει δικο του rounded-corner mask. Σερβιρεται στο `/apple-icon`.
- `app/icon.tsx` (νεο, next/og route): 512×512 maskable PNG. viewBox padded (`-12 -12 72 72`) ωστε το 48-unit mark να καθεται στο central ~66% safe zone -> aggressive launcher masks (κυκλος/squircle) δεν το κοβουν. Σερβιρεται στο `/icon`.
- `app/manifest.ts`: το icons array += `/icon` PNG δυο φορες (purpose «any» + «maskable», type image/png, 512×512) διπλα στο υπαρχον favicon.svg.
- `app/layout.tsx`: επεκταθηκε το `metadata.icons` (το explicit manual icons ΚΑΤΑΡΓΕΙ το Next auto file-convention detection, οποτε τα apple-icon/icon δεν εμφανιζοντουσαν χωρις ρητη δηλωση): `icon` += `/icon` PNG 512×512· νεο `apple` = `/apple-icon` 180×180. Το favicon.svg παραμενει πρωτο (modern browsers το προτιμουν).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· τωρα 11 route entries ολα ○ Static, νεα `/apple-icon` + `/icon`· / αμεταβλητο 2.79 kB / 105 kB First Load JS (icons = ξεχωριστα routes, μηδεν JS στη σελιδα).
- Generated bytes: `.next/server/app/apple-icon.body` = `PNG image data, 180 x 180`· `.next/server/app/icon.body` = `PNG image data, 512 x 512` (`file` command) -> πραγματικα PNG, οχι placeholder.
- Prerendered `<head>` (`.next/server/app/index.html`): και τα 3 links FOUND — `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` + `<link rel="icon" href="/icon" type="image/png" sizes="512x512">` + `<link rel="apple-touch-icon" href="/apple-icon" type="image/png" sizes="180x180">`.
- Manifest body (`.next/server/app/manifest.webmanifest.body`): `"src":"/icon",...,"purpose":"any"` + `"src":"/icon",...,"purpose":"maskable"` FOUND. Route static -> prerendered = ακριβως το served· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο apple-icon.tsx + icon.tsx + manifest.ts + layout.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως lazy-load των mockup blocks. PWA installability (manifest + themeColor + apple-touch-icon + maskable icons) πλεον πληρης.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/roadmap GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD/manifest scope).
- Contact inbox hello@ph-aros.com για τα waitlist emails.

## 2026-07-04

Task: (e) Polish, μερος 36 — RFC 9116 `security.txt` + user-facing em-dash cleanup. Self-contained (μηδεν assets, μηδεν pricing decision). Το site ειχε πληρη SEO/PWA/a11y/404/error surface αλλα (α) καμια security-contact declaration — για privacy/security-first OSS προϊον με hosted σκελος, το `/.well-known/security.txt` ειναι standard σημα ωριμοτητας ωστε researchers να αναφερουν vulns ιδιωτικα· (β) το OG/Twitter `image:alt` περιειχε em-dash («PHAROS — one light…»), που παραβιαζει τη ρητη προτιμηση του Achilleas (NO em-dashes) και ηταν user-facing metadata (social-share alt).

Τι εφτιαξα:
- `public/.well-known/security.txt` (νεο, RFC 9116): Contact mailto:hello@ph-aros.com, Expires 2027-07-04 (~1 ετος μπροστα, οπως απαιτει το RFC), Preferred-Languages en, el (ο Achilleas ειναι Ελληνας), Canonical https://ph-aros.com/.well-known/security.txt + comment οτι ειναι AGPL-3.0 self-hosted, report privately first. Σερβιρεται στο `/.well-known/security.txt` (Next static public/).
- `app/opengraph-image.tsx`: το `export const alt` «PHAROS — one light over everything you run» -> «PHAROS: one light over everything you run» (em-dash -> colon). Το twitter-image.tsx κανει re-export -> και τα δυο image:alt meta διορθωθηκαν με μια αλλαγη.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 11 routes ○ Static, / αμεταβλητο 2.79 kB / 105 kB First Load JS (static file + alt string, μηδεν JS/bundle impact).
- Served output: `public/.well-known/security.txt` present (Next σερβιρει public/ ως-εχει)· prerendered `<head>` (`.next/server/app/index.html`) -> `og:image:alt` + `twitter:image:alt` = «PHAROS: one light over everything you run», grep '—' στο index.html = **0** (μηδεν em-dash στο served head). Static/metadata increment -> επιβεβαιωθηκε στο static output (οπως robots/sitemap/manifest/icons)· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο public/.well-known/security.txt + app/opengraph-image.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες· ισως SECURITY.md στο repo (GitHub territory, οχι landing) η humans.txt. SEO/security/metadata surface πλεον πληρες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/roadmap GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD/manifest/security.txt).
- Contact inbox hello@ph-aros.com για waitlist + security reports (το security.txt το δηλωνει· αν θες dedicated security@ πες μου).

## 2026-07-05

Task: (c/e) νεα ενοτητα «Under the hood» (tech stack) — το site ειχε ολα τα sections (hero/preview/features/ai/integrations/mobile/who/trust/self-host/pricing/compare/roadmap/cta/faq/waitlist) + πληρες SEO/PWA/a11y surface, αλλα ΚΑΜΙΑ αναφορα στο stack. Το primary persona ειναι «Homelabbers» (CLAUDE.md): οι self-hosters ελεγχουν το stack ΠΡΙΝ commit-αρουν. Self-contained (μηδεν assets, μηδεν pricing decision, ολα τα facts απο CLAUDE.md tech-stack).

Τι εφτιαξα:
- `app/page.tsx`: νεο `STACK` constant (8 tiles, ταιριαζει με το «8 modules» motif) + νεα `<section id="stack">` αναμεσα σε #self-host και #pricing (συνεχιζει το technical/audit narrative ακριβως πριν ζητησει λεφτα). Tiles: Next.js 15 (App Router/RSC/server actions/TS strict), MongoDB 7 (Mongoose 8/soft-delete/time-series prices), Docker Compose (web+db+search, ενα command), Tailwind v4, Zod (shared server/client), SearXNG (self-hosted metasearch), «Your AI, your call» (Ollama local η Anthropic/OpenAI/Gemini/OpenRouter), «No public auth» (login-gated LAN/VPN, zero telemetry). Heading «No mystery box».
- `app/globals.css`: νεες classes `.stack-grid` (4-col -> 2-col <900px -> 1-col <480px) + `.stack-tile`/`.stack-name`/`.stack-dot`/`.stack-detail`, reusing το `.card` base + brand color dots (accent/cyan/purple/gold/red). Μηδεν νεο JS.
- ScrollSpy/MobileNav ΑΘΙΚΤΑ: το #stack δεν εχει nav anchor (οπως #preview/#numbers/#integrations/#trust/#cta/#waitlist) -> το self-host μενει highlighted καθως το διασχιζεις, graceful, μηδεν breakage.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· ολα 11 routes ○ Static, / αμεταβλητο 2.79 kB / 105 kB First Load JS (CSS + static markup, μηδεν JS impact).
- Prerendered `.next/server/app/index.html`: FOUND `id="stack"` + «Under the hood» + «No mystery box» + «Next.js 15» + «SearXNG» + «No public auth»· grep '—' στο index.html = **0** (μηδεν em-dash στο served output). Static/markup increment -> επιβεβαιωθηκε στο static output· δεν σηκωσα dev server, δεν αγγιξα το Docker :3000. Docker/web/mobile αθικτα, μηδεν AI call.
- Collision guard: git status πριν το commit -> foreign `.claude/launch.json` + `apps/mobile/src/screens/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο page.tsx + globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) συνεχεια — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· per-plan Offer JSON-LD οταν κλεισουν οι τιμες.

Needs-Achilleas (open, αμεταβλητα):
- Τελικες τιμες hosted tiers (TBD).
- GitHub repo public (η mirror) — CTA/self-host/footer/sameAs/roadmap GitHub links αλλιως 404.
- Επιβεβαιωση ph-aros.com ως domain (SITE_URL σε layout/page/robots/sitemap/JSON-LD/manifest/security.txt).
- Contact inbox hello@ph-aros.com για waitlist + security reports.

---

## 2026-07-05 — DECISIONS FROM ACHILLEAS (interactive session)

Ο Achilleas απαντησε τα ανοιχτα Needs-Achilleas. Υλοποιηστε τα ως εξης:

**D1 — Τιμες hosted tiers (RESOLVED).** Τεσσερα tiers:
- **Free** — self-host, παντα δωρεαν (AGPL-3.0).
- **Solo — €4/mo** — 1 χρηστης, ολα τα modules.
- **Family — €8/mo** — εως 5 members, shared workspace.
- **Pro — €15/mo** — API access + priority support.
Ενημερωστε το pricing/compare section με αυτα τα νουμερα + προσθεστε per-plan Offer JSON-LD (currency EUR,
billing monthly). Το Free να δειχνει καθαρα «self-host, δωρεαν για παντα».

**D2 — GitHub repo (RESOLVED: μενει PRIVATE τωρα).** Ο Achilleas ΔΕΝ κανει το repo public ακομα.
ΟΜΩΣ η self-host/AGPL/«clone it, audit it» αφηγηση ειναι ο πυρηνας του site (primary persona =
Homelabbers), ΑΡΑ ΜΗΝ αφαιρεσετε τα GitHub links. Αποφαση: τα GitHub links μενουν ως **«coming soon»** —
δεσμευση οτι το repo θα γινει public **ΠΡΙΝ** το site παει live (τωρα ειμαστε σε waitlist φαση, δεν
βιαζεται). Πρακτικα: κραταμε το `GITHUB_URL` οπως ειναι· ΟΤΑΝ ερθει το launch, ο Achilleas (α) τρεχει
`git push --force origin main` (mbox purge, εκκρεμει) και (β) κανει το repo public. Μεχρι τοτε τα links
δειχνουν σε private repo (404 για εξω) — αποδεκτο στη waitlist φαση. **ΜΗΝ pivot-αρετε σε SaaS-only.**

**D3 — Domain (RESOLVED).** `ph-aros.com` κατοχυρωμενο απο τον Achilleas. Το SITE_URL μενει ως εχει
σε ολα τα αρχεια (layout/page/robots/sitemap/JSON-LD/manifest/security.txt). Κανενα change needed.

Απομενει ανοιχτο: Contact inbox `hello@ph-aros.com` (waitlist + security reports) — να επιβεβαιωθει
οτι το mailbox υπαρχει/λειτουργει πριν το launch.

## 2026-07-05 (cont.) — D1 υλοποιηθηκε: τελικες τιμες + per-plan Offer JSON-LD

Task: (d/D1) το pricing section εδειχνε ακομα `price: 'TBD'` σε 3 hosted tiers («Hosted · Free/Pro/Team») + copy «indicative»/«being worked out». Ο Achilleas κλεισε τις τιμες (D1 στο προηγουμενο entry). Υλοποιηθηκε.

Τι εφτιαξα (μονο `app/page.tsx`):
- `TIERS`: τα 3 placeholder hosted tiers αντικατασταθηκαν με τα 3 confirmed: **Solo €4/mo** (1 χρηστης, ολα τα modules, AI parsing included), **Family €8/mo** (εως 5 members, shared workspace, higher AI limits — highlighted «Most popular»), **Pro €15/mo** (REST API access + priority support + highest AI limits + early access). Το self-host tier μενει «Free» με νεο cadence «forever» -> «Free forever». Το παλιο hosted-Free tier αφαιρεθηκε (ο Achilleas δεν οριζει hosted free tier — το Free ειναι το self-host).
- `Tier` type: νεο optional `amount?: string` (numeric EUR για JSON-LD· '0'/'4'/'8'/'15').
- JSON-LD: το μονολιθικο single `offers` object εγινε **per-plan Offers array** derived απο `TIERS.filter(amount!==undefined)` — 4 Offers (PHAROS Self-hosted/Solo/Family/Pro), currency EUR, `availability: InStock`, + `UnitPriceSpecification` (billingDuration 1, unitText MONTH) στα 3 paid. Το Free κραταει price '0' χωρις priceSpecification.
- Copy: pricing intro «indicative while we finalise» -> «Every hosted plan includes AI parsing and nightly backups»· footnote «being worked out» -> «Prices in EUR, billed monthly, cancel anytime. Self-hosting stays free forever under AGPL-3.0.»· COMPARE Cost row hosted «Monthly plan» -> «From €4/mo».

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· 11 routes ○ Static, / = 2.79 kB / 105 kB First Load JS (μηδεν JS impact, static markup + JSON-LD).
- Prerendered `.next/server/app/index.html`: €4/€8/€15 + Solo/Family/Pro + «Free forever» present· 4 named Offers («PHAROS Solo/Family/Pro/Self-hosted») + UnitPriceSpecification στα paid· grep 'TBD'/'indicative'/'being worked out' = **0**· grep '—' (em-dash) = **0**. (Τα διπλα counts στο grep = RSC flight-data serialization, rendered HTML ×2 — φυσιολογικο.) Δεν σηκωσα dev server, δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged, μονο `apps/landing/app/page.tsx` modified. Staged μονο page.tsx + LANDING_PROGRESS.md.

Επομενο increment: (e) polish — real app screenshots στα CSS mockups (#preview/#ai/#mobile) οταν υπαρξουν assets· ισως annual-billing toggle (2 μηνες δωρεαν) αν το θελησει ο Achilleas· humans.txt.

Needs-Achilleas (open):
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει οτι το mailbox λειτουργει πριν launch (waitlist + security reports).
- GitHub repo public ΠΡΙΝ launch (D2: μενει private τωρα, links = «coming soon», αποδεκτο στη waitlist φαση).

## 2026-07-05 (cont.²) — D2 υλοποιηθηκε: self-host CTAs = «coming soon» (repo private στη waitlist φαση)

Task: (D2) το repo μενει private τωρα (αποφαση Achilleas), αλλα ολα τα self-host/GitHub CTAs ανοιγαν σε private repo -> 404 για εξω επισκεπτες, χωρις καμια προειδοποιηση. Το D2 ζητησε τα links να μενουν (self-host/AGPL/«audit it» αφηγηση = πυρηνας του site) αλλα να διαβαζονται ως «coming soon». Υλοποιηθηκε ως presentation-only signal, χωρις να πειραξω κανενα URL (οπως ρητα ζητησε το D2).

Τι εφτιαξα:
- `app/page.tsx`: νεα σταθερα `REPO_PUBLIC = false` (documented flag). Οταν false: (α) οι δυο «Self-host it free» ghost CTAs (hero + secondary CTA band) + το self-host pricing-tier CTA (ctaHref === GITHUB_URL) παιρνουν ενα διακριτικο inline `<span class="soon-badge">soon</span>`· (β) νεο `.repo-soon` note bar μεσα στο #self-host, ακριβως ΠΑΝΩ απο το `git clone` code block: gold dot + «The public repo opens right before launch. Join the waitlist and we'll send the clone link the moment it goes live.» με link στο #waitlist. ΟΛΑ gated στο `!REPO_PUBLIC` -> οταν ο Achilleas κανει το repo public + flip σε true, καθε badge/note εξαφανιζεται αυτοματα, μηδεν further edit. Τα GITHUB_URL links αμεταβλητα (D2: «κραταμε το GITHUB_URL οπως ειναι»).
- `app/globals.css`: νεες `.repo-soon` (centered flex note, wrap), `.repo-soon-dot` (7px gold), `.soon-badge` (mono uppercase pill, gold, border-light/surface-2, 0.62rem). Reuse brand vars (gold/accent/surface-2/border-light). Μηδεν νεο JS.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· 11 routes ○ Static, / αμεταβλητο 2.79 kB / 105 kB First Load JS (static markup + CSS, μηδεν JS impact).
- Prerendered `.next/server/app/index.html`: `soon-badge` present (6× = 3 CTAs, rendered HTML ×2 απο RSC flight-data serialization — φυσιολογικο, οπως στα προηγουμενα entries)· `repo-soon` 4× (banner + dot ×2)· «opens right before launch» 2×· «Join the waitlist» 9×· grep '—' (em-dash) = **0**. Static/markup increment -> επιβεβαιωθηκε στο static output (οπως ολα τα προηγουμενα)· δεν σηκωσα dev server, δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged (καμια αλλη ρουτινα mid-commit)· foreign `apps/web/src/*` (modified, ασταγα, αλλων ρουτινων) ΔΕΝ commit — staged μονο apps/landing/app/page.tsx + apps/landing/app/globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) polish — real app screenshots στα CSS mockups οταν υπαρξουν assets· annual-billing toggle αν το θελησει ο Achilleas· humans.txt. ΟΤΑΝ γινει το repo public: flip `REPO_PUBLIC` σε true (μια γραμμη) -> ολα τα «coming soon» σβηνουν.

Needs-Achilleas (open):
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει οτι το mailbox λειτουργει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge εκκρεμει)· μετα flip `REPO_PUBLIC=true` στο landing (D2).

## 2026-07-05 (cont.³) — (e) polish: humans.txt credits + rel=author link

Task: (e) polish. Το site ειναι ωριμο (11 sections, full JSON-LD graph, 9-question FAQ, per-plan Offers).
Απο τα εκκρεμη next-increment options: (i) real app screenshots — ΔΕΝ υπαρχουν assets, skip· (ii)
annual-billing toggle — δεσμευει σε συγκεκριμενες ετησιες τιμες (π.χ. «2 μηνες δωρεαν»), αρα ΧΡΕΙΑΖΕΤΑΙ
confirmation του Achilleas, μενει Needs-Achilleas, ΔΕΝ το εφτιαξα· (iii) humans.txt — self-contained,
standard web convention, μηδεν pricing commitment. Διαλεξα το (iii).

Τι εφτιαξα:
- `public/humans.txt`: καθιερωμενο humans.txt (TEAM/THANKS/SITE sections) στο brand voice — creator
  Achilleas, site/repo/license (AGPL-3.0 «free forever»), open-source thanks (Next.js/React/MongoDB/
  Mongoose/Tailwind/Zod/Recharts/Ollama/Tesseract/SearXNG), stack/fonts/palette/privacy note, μικρο
  ASCII lighthouse. English copy, μηδεν em-dashes. Σερβιρεται στο `/humans.txt` (public/ root).
- `app/layout.tsx`: το `authors: [{ name: 'Achilleas' }]` εγινε `authors: [{ name: 'Achilleas',
  url: '/humans.txt' }]` -> ο Next εκπεμπει το conventional `<link rel="author" href="/humans.txt">`
  διπλα στο `<meta name="author">`. Μηδεν αλλη αλλαγη.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· 11 routes ○ Static, / αμεταβλητο 2.79 kB / 105 kB First Load JS.
- Prerendered `.next/server/app/index.html`: `<link rel="author" href="/humans.txt"/>` present.
- `public/humans.txt` (1228 bytes) υπαρχει, θα σερβιρεται στο /humans.txt· grep '—' (em-dash) = 0.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev server στον φακελο· τα preview tools δεν το φτανουν),
  δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged απο αλλη ρουτινα. Staged μονο τα δικα μου:
  apps/landing/public/humans.txt + apps/landing/app/layout.tsx + apps/landing/LANDING_PROGRESS.md.

Επομενο increment: (e) polish συνεχεια — real app screenshots στα CSS mockups οταν υπαρξουν assets·
annual-billing toggle ΜΟΝΟ αφου ο Achilleas κλεισει ετησιες τιμες· ισως `/.well-known/` housekeeping.

Needs-Achilleas (open):
- Annual billing: αν θελει ετησια πληρωμη, να ορισει το discount (π.χ. 2 μηνες δωρεαν) πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει οτι λειτουργει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-05 (cont.⁴) — (e) polish: waitlist `<noscript>` fallback (JS-off resilience)

Task: (e) polish. Το site ειναι ωριμο (17 sections). Απο τα εκκρεμη next-increment options: real
screenshots (χωρις assets, skip)· annual-billing toggle (δεσμευει ετησιες τιμες, μενει Needs-Achilleas,
ΔΕΝ το αγγιξα). Εντοπισα πραγματικο resilience gap: το `Waitlist.tsx` ειναι client component με
`mailto:`-based submit· το κουμπι ειναι `disabled={!valid}` και το `valid` ξεκιναει false -> με JS
απενεργοποιημενο (ή αν πεσει το bundle) ο επισκεπτης βλεπει disabled button + νεκρη φορμα, ΧΩΡΙΣ τροπο
να μπει στη waitlist (= το κυριο conversion του site). Διαλεξα να το κλεισω· self-contained, μηδεν
commitment, μηδεν asset, μηδεν Achilleas.

Τι εφτιαξα:
- `app/components/Waitlist.tsx`: προσθηκη `<noscript>` block μεσα στη φορμα (μετα το sent-note) με ενα
  απλο `.waitlist-note` paragraph + direct `mailto:hello@ph-aros.com?subject=PHAROS hosted waitlist`
  link («Email hello@ph-aros.com to join the hosted waitlist.»). Reuse του υπαρχοντος `.waitlist-note`
  style (μηδεν νεο CSS). Οταν JS τρεχει, το `<noscript>` δεν εμφανιζεται· οταν οχι, ο επισκεπτης εχει
  λειτουργικο mailto path. Μηδεν αλλη αλλαγη (state/validation/submit αμεταβλητα).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· 9+2 routes ○ Static, / = 2.83 kB / 105 kB First Load JS (ηταν 2.79 kB·
  +0.04 kB απο το static noscript markup, μηδεν JS impact — το `<noscript>` ειναι static HTML).
- Prerendered `.next/server/app/index.html`: `noscript` present· «to join the hosted waitlist» present.
- grep '—' (em-dash) στο Waitlist.tsx = 0.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev server στον φακελο· τα preview tools δεν το φτανουν
  και δεν σηκωνω ανταγωνιστικο)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged απο αλλη ρουτινα. Foreign
  `apps/web/SAAS_PROGRESS.md` (modified, ασταγο, αλλης ρουτινας) ΔΕΝ commit. Staged μονο τα δικα μου:
  apps/landing/app/components/Waitlist.tsx + apps/landing/LANDING_PROGRESS.md.

Επομενο increment: (e) polish συνεχεια — real app screenshots στα CSS mockups οταν υπαρξουν assets·
annual-billing toggle ΜΟΝΟ αφου ο Achilleas κλεισει ετησιες τιμες.

Needs-Achilleas (open):
- Annual billing: αν θελει ετησια πληρωμη, να ορισει το discount (π.χ. 2 μηνες δωρεαν) πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει οτι λειτουργει πριν launch (το noscript fallback +
  ολα τα waitlist paths δειχνουν εκει).
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-06 — (e) polish: surface well-known files in footer + build-stamped sitemap

Task: (e) polish. Το site ειναι ωριμο (17 sections, 11 static routes, JSON-LD Organization/WebSite/
SoftwareApplication+Offers/FAQPage/HowTo, OG images, manifest, security.txt, humans.txt, reduced-motion,
noscript waitlist). Εψαξα για πραγματικα self-contained κενα (μηδεν commitment, μηδεν asset, μηδεν
Achilleas). Βρηκα δυο:
- Τα standard well-known αρχεια (`/.well-known/security.txt` + `/humans.txt`) υπηρχαν αλλα ΔΕΝ ηταν
  linked πουθενα -> μη ανακαλυψιμα. Το security contact ειδικα πρεπει να ειναι εμφανες πριν το repo
  γινει public.
- Το `app/sitemap.ts` ειχε hardcoded `lastModified = new Date('2026-07-02')` -> stale (σημερα 07-06),
  και θα εμενε παγωμενο σε καθε μελλοντικο build.

Τι εφτιαξα:
- `app/page.tsx` (footer Legal column): προσθηκη δυο navlinks — «Security» -> `/.well-known/security.txt`
  και «Credits» -> `/humans.txt` (target=_blank rel=noopener noreferrer, ιδιο pattern με τα αλλα
  external footer links· εγκαταλειπουν το SPA). Balance-αρει και τη Legal στηλη (2 -> 4 items, οπως οι
  αλλες). Μηδεν αλλη αλλαγη στο page.
- `app/sitemap.ts`: `new Date('2026-07-02')` -> `new Date()` (build-time stamp) + σχολιο. Το sitemap
  γραφεται στο build, οποτε παντα αντικατοπτριζει το τελευταιο build αντι για stale literal.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· 9+2 routes ○ Static, / = 2.83 kB / 105 kB First Load JS (αμεταβλητο —
  static markup only).
- Prerendered `.next/server/app/index.html`: `href="/.well-known/security.txt"` + `href="/humans.txt"`
  present.
- `.next/server/app/sitemap.xml.body`: `<lastmod>` πλεον build-stamped ISO timestamp (οχι το 2026-07-02).
- grep '—' (em-dash) σε page.tsx + sitemap.ts = 0.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev server στον φακελο· τα preview tools δεν το φτανουν
  και δεν σηκωνω ανταγωνιστικο)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged απο αλλη ρουτινα, μηδεν foreign
  uncommitted files. Staged μονο τα δικα μου: apps/landing/app/page.tsx + apps/landing/app/sitemap.ts +
  apps/landing/LANDING_PROGRESS.md.

Επομενο increment: (e) polish συνεχεια — real app screenshots στα CSS mockups οταν υπαρξουν assets·
annual-billing toggle ΜΟΝΟ αφου ο Achilleas κλεισει ετησιες τιμες.

Needs-Achilleas (open):
- Annual billing: αν θελει ετησια πληρωμη, να ορισει το discount (π.χ. 2 μηνες δωρεαν) πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει οτι λειτουργει πριν launch (waitlist + noscript +
  security.txt + νεο footer «Security» link δειχνουν εκει).
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-06 — (e) polish: /privacy legal page + footer link

Task: (e) polish. Το site ειναι ωριμο (17 sections, JSON-LD, OG, well-known files). Εψαξα για
self-contained κενο με πραγματικη αξια (μηδεν asset, μηδεν commitment) και βρηκα ενα ουσιαστικο:
η Legal στηλη στο footer ειχε License / Security / Credits / FAQ αλλα ΚΑΜΙΑ Privacy Policy. Για paid
SaaS που μαζευει waitlist emails σε EU (Ελλαδα, GDPR), η δηλωση απορρητου ειναι πραγματικη αναγκη προ
launch, οχι busywork.

Τι εφτιαξα:
- `app/privacy/page.tsx` (νεο static route): πληρης Privacy Policy σε plain English, δομημενη γυρω απο
  το DUAL model — Section 1 «Self-hosted (open source)» ξεκαθαριζει οτι στο self-host ΤΙΠΟΤΑ δεν φτανει
  σε εμας (no telemetry, local Ollama option, δικα σου backups)· Section 2 «Hosted SaaS» (τι μαζευουμε:
  account/content/logs/payment via processor, πως δουλευει το AI parsing + BYO-key)· 3 waitlist email,
  4 GDPR rights, 5 retention/trash, 6 security (link στο security.txt), 7 changes, 8 contact
  (`hello@ph-aros.com`). Minimal header (PharosMark + back-home), gradient H1, brand palette/vars, `.card`
  για draft banner. **Draft banner (gold) + `robots:{index:false}`**: το page ειναι honest draft «not yet
  legal advice, reviewed before hosted launch» και ΔΕΝ μπαινει στο index μεχρι review (safe — draft policy
  indexed = liability). follow:true ωστε τα links να ακολουθουνται.
- `app/page.tsx` (footer Legal): προσθηκη `<a href="/privacy">Privacy</a>` αναμεσα σε License και Security
  (internal SPA link, οχι external). Legal στηλη 4 -> 5 items.
- `app/globals.css`: νεα `.inline-link` class (cyan underline, hover accent) για in-flow prose links μεσα
  στο privacy doc — προστεθηκε διπλα στο `.navlink`, μηδεν impact σε υπαρχοντα markup.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· τωρα 10+2 routes ○ Static (νεο `/privacy` 147 B, 103 kB First Load).
  `/` αμεταβλητο 2.83 kB / 105 kB (μονο ενα footer link).
- Prerendered `.next/server/app/privacy.html`: «Privacy Policy» + self-host/GDPR + inline-link present.
- `.next/server/app/index.html`: `href="/privacy"` present στο footer.
- em-dash check: 0 στα δικα μου (globals.css εχει 3 σε ΠΡΟΫΠΑΡΧΟΝΤΑ comments εκτος edit region).
  Διορθωσα το ενα em-dash που ειχα σε δικο μου code comment.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev server στον φακελο — verify μεσω build output,
  αρκετο για static page)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ΤΙΠΟΤΑ staged απο αλλη ρουτινα. Staged μονο τα δικα μου:
  app/privacy/page.tsx + app/page.tsx + app/globals.css + LANDING_PROGRESS.md.

Επομενο increment: (e) polish συνεχεια — Terms of Service stub (ιδιο pattern με privacy, draft+noindex)
οταν ο Achilleas το θελησει· real app screenshots στα CSS mockups οταν υπαρξουν assets· annual-billing
toggle ΜΟΝΟ αφου κλεισουν ετησιες τιμες.

Needs-Achilleas (open):
- Privacy Policy: review + finalize (ιδιως AI-provider/payment-processor ονοματα + retention windows)
  ΠΡΙΝ hosted launch, μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Terms of Service: αν θελει ξεχωριστο ToS page, να το πω (draft pattern ετοιμο).
- Annual billing: αν θελει ετησια πληρωμη, να ορισει το discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει οτι λειτουργει πριν launch (waitlist + noscript +
  security.txt + footer Security + νεο privacy page δειχνουν εκει).
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-06 (cont.) — (e) polish: /terms Terms of Service page + footer link

Task: (e) polish. Το προηγουμενο increment (2026-07-06) εβαλε /privacy και σημειωσε ως επομενο «Terms of
Service stub (ιδιο pattern με privacy, draft+noindex)». Self-contained, μηδεν asset, μηδεν commitment, μηδεν
Achilleas. Για paid SaaS σε EU, οι οροι χρησης ειναι πραγματικη προ-launch αναγκη διπλα στη Privacy Policy.

Τι εφτιαξα:
- `app/terms/page.tsx` (νεο static route): πληρες Terms of Service σε plain English, γυρω απο το DUAL model.
  11 sections: 1 Self-hosted (AGPL-3.0 governs, οχι αυτοι οι οροι, as-is), 2 Hosted SaaS (acceptance),
  3 Account, 4 Acceptable use (list), 5 Your content (ownership + JSON export, link στο /privacy),
  6 Plans & billing (advance, third-party processor, τιμες not yet published), 7 Availability & changes,
  8 Disclaimer & liability (GDPR-safe), 9 Termination, 10 Governing law (Greece), 11 Contact. Ιδιο pattern
  με /privacy: minimal header (PharosMark + back-home), gradient H1, `Section` helper, gold draft banner +
  `robots:{index:false, follow:true}`, skip-link, brand vars, inline-link. Reuse υπαρχοντων classes, μηδεν
  νεο CSS, μηδεν client JS.
- `app/page.tsx` (footer Legal): `<a href="/terms">Terms</a>` αναμεσα σε Privacy και Security. Legal στηλη
  5 -> 6 items.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success· τωρα 11+2 routes ○ Static (νεο `/terms` 149 B, 103 kB First Load). `/`
  αμεταβλητο (μονο ενα footer link).
- Prerendered `.next/server/app/terms.html`: «Terms of», «Governing law», «Draft in review» present·
  `<meta name="robots" content="noindex, follow">` σωστο. `.next/server/app/index.html`: `href="/terms"`
  present στο footer.
- em-dash check: 0 σε terms/page.tsx + page.tsx.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev server στον φακελο· verify μεσω build output, αρκετο
  για static page)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ελεγχος για foreign staged files.

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες· ισως μικρο legal sub-nav cross-link Privacy <-> Terms.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-06 (cont.²) — (e) polish: legal cross-nav Privacy ↔ Terms

Task: (e) polish. Το προηγουμενο increment (/terms) σημειωσε ως επομενο «μικρο legal sub-nav cross-link
Privacy <-> Terms». Self-contained, μηδεν asset, μηδεν Achilleas, μηδεν νεο CSS/JS. Ενας χρηστης που
διαβαζει τη Privacy Policy πρεπει να φτανει ευκολα στους Ορους (και αντιστροφα)· μεχρι τωρα καθε legal page
ειχε μονο «Back to home» + «Self-host it free» χωρις συνδεσμο στην αδελφη σελιδα.

Τι εφτιαξα:
- `app/terms/page.tsx`: στη γραμμη κουμπιων στο τελος, νεο ghost button `<a href="/privacy">Privacy Policy</a>`
  αναμεσα σε «Back to home» και «Self-host it free».
- `app/privacy/page.tsx`: συμμετρικα, νεο ghost button `<a href="/terms">Terms of Service</a>` στην ιδια θεση.
  Reuse υπαρχουσας `.btn .btn-ghost` class, μηδεν νεο styling.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, `/privacy` + `/terms` αμεταβλητα 149 B / 103 kB First Load.
- Prerendered: `.next/server/app/terms.html` -> `href="/privacy" class="btn btn-ghost">Privacy Policy`
  present· `.next/server/app/privacy.html` -> `href="/terms" class="btn btn-ghost">Terms of Service` present.
- em-dash check: 0 σε terms/page.tsx + privacy/page.tsx.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev server στον φακελο· verify μεσω build output, αρκετο
  για static pages)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ελεγχος για foreign staged files.

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-06 (cont.³) — (e) polish: hero reassurance chips κατω απο τα CTAs

Task: (e) polish. Τα δυο επομενα increments που ειχα σημειωσει (real app screenshots, annual-billing
toggle) ειναι μπλοκαρισμενα (assets / Needs-Achilleas), οποτε διαλεξα ενα φρεσκο, self-contained: μια
σειρα reassurance chips ακριβως κατω απο τα hero CTAs. Ειναι το σημειο με τη μεγαλυτερη προσοχη, και μεχρι
τωρα οι core διαφοροποιησεις (open source, private, ευκολο self-host) φαινονταν μονο αφου κατεβεις στο
#trust. Proven conversion pattern, ειλικρινες για το προϊον, μηδεν asset, μηδεν client JS, μηδεν Achilleas.

Τι εφτιαξα:
- `app/page.tsx`: νεο const `HERO_TRUST` (3 chips: «AGPL-3.0 open source» / «No telemetry, ever» /
  «Self-host in minutes», με icons code/eyeOff/server + accent/cyan/purple) + render ως `<ul.hero-assurance>`
  αμεσως μετα τη γραμμη κουμπιων στο hero (`aria-label="What you get"`, καθε chip με `<Icon>`).
- `app/globals.css`: νεες classes `.hero-assurance` (flex-wrap, centered, gap) + `.hero-chip` (pill:
  border/surface/rounded, text-dim, 0.85rem) + `.hero-chip-ico`. Reuse brand vars, μηδεν νεο keyframe/JS.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static· `/` 2.71->2.83 kB (μονο +CSS/markup, καμια νεα route).
- Prerendered `.next/server/app/index.html`: «AGPL-3.0 open source», «No telemetry, ever»,
  «Self-host in minutes», class `hero-assurance` ολα present.
- em-dash check: 0 σε page.tsx· τα 3 hits στο globals.css ειναι προϋπαρχοντα box/em σε αλλα comments
  (γραμμες 1463/1489/1524), οχι δικα μου, δεν τα αγγιξα.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev στον φακελο· verify μεσω build output αρκετο για
  static page)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> μονο app/page.tsx + app/globals.css, κανενα foreign staged.

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-06 (cont.⁴) — (e) polish: deep-linkable, shareable FAQ items

Task: (e) polish. Τα δυο μπλοκαρισμενα increments (real app screenshots, annual-billing toggle) μενουν
blocked (assets / Needs-Achilleas), οποτε διαλεξα ενα φρεσκο self-contained: να γινουν τα FAQ items
deep-linkable + shareable. Μεχρι τωρα ολα τα `<details>` ηταν ανωνυμα, δεν μπορουσες να στειλεις link σε
συγκεκριμενη απαντηση, και μια hosted-support απαντηση («δες το FAQ για backups») δεν ειχε που να δειξει.
Μηδεν asset, μηδεν Achilleas, ακολουθει το υπαρχον pattern μικρων client components (BackToTop/ScrollSpy/
MobileNav).

Τι εφτιαξα:
- `app/components/FaqDeepLink.tsx` (νεο, `'use client'`, progressive enhancement, no-op σε SSR/αν λειπει το
  FAQ): (α) σε load + `hashchange`, αν το URL hash ταιριαζει FAQ item -> ανοιγει το `<details>` +
  `scrollIntoView` (honours prefers-reduced-motion). (β) οταν ο χρηστης ανοιγει ερωτηση, ενημερωνει το hash
  μεσω `history.replaceState` (οχι push -> δεν γεμιζει το back button) ωστε το address bar να δειχνει την
  ανοιχτη απαντηση και να αντιγραφεται/μοιραζεται.
- `app/page.tsx`: (α) νεο helper `faqId(q)` -> stable slug `faq-<kebab>` απο το question (deterministic, τα
  deep links μενουν εγκυρα cross-build)· (β) καθε FAQ `<details>` πηρε `id={faqId(f.q)}`· (γ) render
  `<FaqDeepLink/>` μεσα στο `#faq` section· (δ) στο JSON-LD FAQPage καθε `Question` πηρε `url:
  ${SITE_URL}/#${faqId(f.q)}` (legit SEO, δειχνει στο anchor της απαντησης). Import του FaqDeepLink.
- Μηδεν νεο CSS (τα `<details>`/`.faq-item` styles υπαρχουν ηδη).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static· `/` 2.83 -> 3.08 kB (client component + markup, καμια νεα route).
- Prerendered `.next/server/app/index.html`: 9 `id="faq-..."` anchors present (faq-is-self-hosting-really-
  free ... faq-is-my-financial-data-secure) + JSON-LD `ph-aros.com/#faq-...` urls present.
- em-dash check: 0 σε FaqDeepLink.tsx + page.tsx.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev στον φακελο· verify μεσω build output + prerendered
  HTML)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> ελεγχος για foreign staged files.

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες· ισως «copy link» affordance πανω σε καθε ανοιχτο FAQ.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-09 — (e) polish: «Copy link» affordance σε καθε ανοιχτη FAQ απαντηση

Task: (e) polish. Τα δυο blocked increments (real app screenshots -> assets· annual-billing toggle ->
Needs-Achilleas τιμες) μενουν κλειστα, οποτε πηρα το φρεσκο self-contained που ειχα σημειωσει προηγουμενως:
«copy link» πανω σε καθε ανοιχτη FAQ. Μεχρι τωρα το deep-linking (FaqDeepLink) εγραφε το hash στο address
bar οταν ανοιγες ερωτηση, αλλα δεν υπηρχε ρητο affordance για να αντιγραψεις/μοιραστεις τον συνδεσμο· ενα
hosted-support reply («δες το FAQ για backups») δεν ειχε ευκολο κουμπι να δωσει τον ακριβη συνδεσμο.

Τι εφτιαξα:
- `app/components/FaqCopyLink.tsx` (νεο, `'use client'`, progressive enhancement σαν το CopyButton):
  μικρο inline κουμπι «Copy link» στο τελος καθε απαντησης. On click αντιγραφει τον shareable deep link
  (`origin+pathname#faq-...`, χτισμενο client-side ωστε να ειναι σωστος σε localhost/preview/prod χωρις baked
  base URL) + ενημερωνει το hash μεσω `replaceState` (οχι history spam) + flip σε «Copied» για ~1.8s.
  Mountαρει ΜΟΝΟ αν υπαρχει Clipboard API -> no-JS/SSR readers κραταν πληρες FAQ, απλα χωρις το shortcut.
  Distinct link-chain εικονιδιο (οχι το copy-clipboard του CopyButton) για να διαβαζεται «συνδεσμος».
- `app/page.tsx`: το `<p className="faq-a">` εγινε `<div className="faq-a"><p>{a}</p><FaqCopyLink id=.../></div>`
  ωστε το κουμπι να καθεται κατω απο το κειμενο· import του FaqCopyLink.
- `app/globals.css`: `.faq-a` -> layout container (κρατα padding/max-width), το χρωμα/μεγεθος κειμενου
  μεταφερθηκε σε `.faq-a p`· νεα `.faq-copy` / `.faq-copy:hover` / `.faq-copy-done` (subtle faint chip,
  accent οταν copied, honours το global reduced-motion transition override).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static· `/` 3.08 -> 3.27 kB (client component + markup, καμια νεα route).
- Prerendered `.next/server/app/index.html`: 9 `class="faq-a"` wrappers present· `faq-copy` = 0 στο prerender,
  ΑΝΑΜΕΝΟΜΕΝΟ (το κουμπι renderαρει μονο client-side αφου το `supported` γινεται true σε useEffect, ιδιο
  pattern με CopyButton) -> zero SSR regression, το FAQ δουλευει και χωρις JS.
- em-dash check: 0 σε FaqCopyLink.tsx + page.tsx.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev στον φακελο· verify μεσω build output + prerendered
  HTML)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> κανενα foreign staged file· stage ΜΟΝΟ τα δικα μου
  (page.tsx, globals.css, FaqCopyLink.tsx, LANDING_PROGRESS.md), τα foreign modified (PRODUCT_BACKLOG,
  mobile, docs) δεν τα αγγιξα.

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-09 — (e) polish: reading-progress «lighthouse beam» στην κορυφη

Task: (e) polish. Τα δυο blocked increments (real app screenshots -> assets· annual-billing toggle ->
Needs-Achilleas τιμες) μενουν κλειστα, οποτε πηρα φρεσκο self-contained: ενα reading-progress indicator
που ταιριαζει στο brand motif (φαρος = δεσμη φωτος). Μεχρι τωρα ο αναγνωστης δεν ειχε καμια ενδειξη ποσο
βαθια εχει διαβασει τη μακρια landing (17 sections)· ο ScrollSpy φωτιζει το τρεχον nav section αλλα οχι
συνολικη προοδο.

Τι εφτιαξα:
- `app/components/ScrollProgress.tsx` (νεο, `'use client'`, progressive enhancement σαν BackToTop):
  λεπτη 3px μπαρα καρφωμενη στο πανω-πανω edge (fixed, z-index 60, pointer-events none) που γεμιζει
  αριστερα-προς-δεξια καθως scroll-αρεις. rAF-throttled scroll+resize listener γραφει `scaleX(0..1)`
  transform (transform-origin left) -> ποτε layout, μονο compositor. Κρυβεται (opacity 0) οταν η σελιδα
  ειναι πιο κοντη απο το viewport (τιποτα να scroll-αρεις) ή στο top. aria-hidden (καθαρα διακοσμητικο),
  no-op σε SSR.
- `app/page.tsx`: import + mount `<ScrollProgress/>` διπλα στα ScrollSpy/BackToTop.
- `app/globals.css`: νεα `.scroll-progress` (fixed top strip) + `.scroll-progress-beam` (accent->cyan->
  purple gradient, subtle glow shadow, transition transform 0.08s linear -> ομαλο fill· το global
  reduced-motion override το μηδενιζει αυτοματα). Το CSS comment ακολουθει το υπαρχον section-header
  convention του αρχειου (lines 1490/1539/1574 χρησιμοποιουν ιδιο «— » στυλ).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static· `/` 3.27 -> 3.48 kB (νεο client component, καμια νεα route).
- Prerendered `.next/server/app/index.html`: `scroll-progress` + `scroll-progress-beam` present (η
  container μαρκα renderαρει server-side· το scaleX το γραφει το JS client-side σε useEffect) -> zero SSR
  regression, η σελιδα δουλευει και χωρις JS (η μπαρα απλα μενει στο 0/κρυφη).
- em-dash check: 0 σε ScrollProgress.tsx + page.tsx (το CSS comment ακολουθει το local file convention).
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev στον φακελο· verify μεσω build output + prerendered
  HTML)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> κανενα foreign staged file· stage ΜΟΝΟ τα δικα μου
  (page.tsx, globals.css, ScrollProgress.tsx, LANDING_PROGRESS.md)· το foreign modified
  (apps/mobile ReceiptsScreen) δεν το αγγιξα.

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες· ισως keyboard-focus outline tuning ή print stylesheet.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` — να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-09 — (e) polish: print / save-to-PDF stylesheet

Task: (e) polish. Τα δυο blocked increments (real app screenshots -> assets· annual-billing toggle ->
Needs-Achilleas τιμες) μενουν κλειστα. Φρεσκο self-contained: ενα `@media print` stylesheet. Μεχρι τωρα,
οποιος τυπωνε ή εκανε save-to-PDF την pricing/landing (dark-first, 17 sections) εβγαζε μαυρο φοντο
(σπαταλη μελανιου), το gradient-clipped hero title («everything you run.») τυπωνοταν κενο (transparent
fill), και το sticky translucent header + το ambient grid/glow + τα floating chrome (scroll beam,
back-to-top, mobile burger) βρωμιζαν τη σελιδα.

Τι εφτιαξα:
- `app/globals.css`: νεο `@media print` block στο τελος (μετα το reduced-motion). Στρατηγικη: flip των
  palette CSS vars σε light μεσα στο print scope (`:root { --bg:#fff; --text:#111; --accent:#00994d
  darkened· ... }`) -> re-themes ΚΑΙ τις class-based ΚΑΙ τις inline `var(...)` χρησεις του page.tsx με μια
  κινηση. Επιπλεον: `body::before/after` (grid+glow) display:none, `header` un-stick (position:static +
  bg #fff + no backdrop-filter, override των inline styles με !important), hide `.scroll-progress`/
  `.back-to-top`/`.skip-link`/`.nav-burger`/`.drawer-*`, `*` box-shadow+text-shadow none (flat cards),
  `break-inside:avoid` σε cards + `break-after:avoid` σε h1-h3.
- `app/page.tsx`: εδωσα class `hero-highlight` στο gradient hero span (κραταει τα inline gradient styles)
  ωστε το print rule να κανει override το inline `color:transparent` -> solid accent ink (stylesheet
  !important νικαει non-important inline). Μηδεν αλλη αλλαγη markup.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static· `/` 3.48 kB (μονο CSS + ενα className, καμια νεα JS/route).
- Built CSS `.next/static/css/*.css`: το `@media print{:root{--bg:#ffffff;...}}` block present· `hero-highlight`
  σε CSS + prerendered `index.html` (class attr + inlined critical style) -> zero SSR regression.
- em-dash check: 0 σε page.tsx + ολα τα components· το νεο CSS comment γραφτηκε ΧΩΡΙΣ em-dash (comma style,
  σε αντιθεση με το προϋπαρχον file convention lines 1490/1516/1539/1574) -> hard-rule compliant.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev στον φακελο· print media δεν ειναι screen-observable,
  verify μεσω build output + built CSS grep)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit -> κανενα foreign staged file· stage ΜΟΝΟ τα δικα μου
  (page.tsx, globals.css, LANDING_PROGRESS.md).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες· ισως OG-image polish ή content copy pass.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` να επιβεβαιωθει πριν launch.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-09 — (e) polish: /llms.txt για AI answer engines

Task: (e) polish. Τα δυο blocked increments (real app screenshots -> assets· annual-billing toggle ->
Needs-Achilleas τιμες) μενουν κλειστα. Το site ειναι ηδη ωριμο (17 sections, JSON-LD graph
[Organization/WebSite/SoftwareApplication+Offers/FAQPage/HowTo], robots/sitemap, OG images, privacy/terms,
security.txt, humans.txt, ολα τα referenced assets resolve). Φρεσκο self-contained increment: ενα static
`/llms.txt` (llmstxt.org convention) ωστε AI answer engines (ChatGPT, Perplexity, Claude κλπ) να
περιγραφουν το PHAROS σωστα. Ταιριαζει με το AI-forward brand, μηδεν ρισκο (static file).

Τι εφτιαξα:
- `public/llms.txt` (νεο, 3.8KB): llmstxt.org format, H1 «PHAROS» + blockquote summary (τι ειναι, dual
  self-host/hosted, tagline, backronym) + design principles paragraph + sections **Modules** (8 module
  links -> #features/#ai), **Pricing** (4 tiers με τα ΠΡΑΓΜΑΤΙΚΑ ποσα απο TIERS: Self-hosted Free /
  Solo €4 / Family €8 / Pro €15, με «indicative during beta» disclaimer), **Getting started** (Docker /
  GitHub / README / waitlist), **More** (FAQ/privacy/terms/security.txt/license). Ολα absolute URLs σε
  ph-aros.com + github.com/achilleasgkekas/pharos. Copy απο τα υπαρχοντα page constants (μηδεν νεα claims).
- `app/page.tsx`: νεο footer link «AI (llms.txt)» στη Legal στηλη, διπλα στο «Credits» (/humans.txt),
  discoverable + target=_blank rel=noopener. Μηδεν αλλη αλλαγη markup.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static· `/` 3.48 kB (μονο ενα footer <a>, καμια νεα route/JS· το
  llms.txt ειναι public static, δεν μετραει σαν route).
- `public/llms.txt` served ok (3792 bytes)· prerendered `index.html` περιεχει «AI (llms.txt)» + `href="/llms.txt"`.
- em-dash check: αρχικα εβαλα em-dashes στα pricing labels («Solo — €4/month»)· τα αντικατεστησα ολα (5)
  με middot «·» (on-brand, το site το χρησιμοποιει ηδη σε «© 2026 PHAROS · AGPL-3.0»), 0 em-dash πλεον
  σε llms.txt + page.tsx. Hard-rule compliant.
- Δεν σηκωσα dev server (αλλη ρουτινα τρεχει ηδη dev στον φακελο· static txt verify μεσω build output +
  prerender grep)· δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: git status πριν το commit, ελεγχος για foreign staged· stage ΜΟΝΟ τα δικα μου
  (public/llms.txt, page.tsx, LANDING_PROGRESS.md).

Επομενο increment: (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets· annual-billing toggle
ΜΟΝΟ αφου κλεισουν ετησιες τιμες· ισως BreadcrumbList JSON-LD στα /privacy /terms ή content copy pass.

Needs-Achilleas (open):
- Terms + Privacy: review + finalize (billing terms, governing-law jurisdiction, provider/processor ονοματα)
  ΠΡΙΝ hosted launch· μετα flip `robots:{index:false}` -> indexable + add στο sitemap.
- Annual billing: discount πριν φτιαξω toggle.
- Contact inbox `hello@ph-aros.com` να επιβεβαιωθει πριν launch.
- Hosted τιμες (€4/€8/€15): confirm ΠΡΙΝ launch, τωρα marked «indicative during beta» και στο llms.txt.
- GitHub repo public ΠΡΙΝ launch + `git push --force origin main` (mbox purge)· μετα flip `REPO_PUBLIC=true`.

## 2026-07-09 — (d)+(e): annual/monthly billing toggle + Terms/Privacy placeholders

Interactive session, ο Αχιλλέας απαντησε στα open Needs-Achilleas: repo ΜΕΝΕΙ private (mbox ηδη out of
reachable history, local==origin)· annual = **2 μηνες δωρεαν (~17%)**· Terms/Privacy = **γραψε τωρα με
placeholders**. Δυο increments σε ενα run:

### 1. Annual/monthly billing toggle (pricing)
- `app/components/Pricing.tsx` (νεο, `'use client'`): segmented pill Monthly|Annual («2 months free»
  cyan chip) + το pricing grid εγινε client island (χρειαζεται useState). Annual = monthly×10 (2 μηνες
  δωρεαν): Solo €4->€40, Family €8->€80, Pro €15->€150· cadence «per year» + sub-line «€X.XX/mo, billed
  annually»· Self-hosted (Free) ΔΕΝ αλλαζει. `isHosted()` guard = amount θετικο + cadence includes month.
  Ολα τα tiers renderαρουν `.billing-sub` (blank στο free) για vertical alignment.
- `app/page.tsx`: το inline `.pricing-grid` (~50 lines) αντικατασταθηκε με `<Pricing tiers repoPublic
  githubUrl />` + import· footer note -> «Annual plans bill once a year (2 months free)». Το soon-badge/
  REPO_PUBLIC logic περασε ως prop.
- `app/globals.css`: νεα `.billing-toggle` (segmented pill, surface-2 bg) + `.billing-opt`/`-on` (accent
  #00ff88 active, dark ink) + `.billing-save` (cyan chip) + `.billing-sub`. Χωρις em-dash στα comments.

### 2. Terms + Privacy: legal-entity placeholder + fixes
- `app/terms/page.tsx` + `app/privacy/page.tsx`: νεες consts `ENTITY='[Operating entity, to confirm]'` +
  `PROCESSOR='Stripe'`. Draft banners αναφερουν ρητα οτι entity + processor ειναι placeholders pending
  confirmation. Privacy §4 rights + §2: «operated by {ENTITY}, the data controller, based in EU (Greece)»
  (GDPR controller ID, ελειπε). Terms §2 hosted + §10 governing-law: name το {ENTITY}. Terms §6 billing:
  διορθωθηκαν stale tier names («Free, Pro, and Dedicated» -> «free self-hosted + Solo/Family/Pro») +
  annual «two months free» (consistent με το νεο toggle) + {PROCESSOR}. Payment-data + sub-processor list
  -> {PROCESSOR}. Οι 3 sub-processor bullets normalized απο em-dash σε comma (hard-rule).

Verify:
- `npm run type-check` -> exit 0· `npm run build` -> success, 13/13 static· `/` unchanged route set.
- **Live preview (landing-dev :3100, δικος μου server, stopped μετα)**: DOM drive -> Monthly = Solo €4/
  Family €8/ Pro €15 «billed monthly»· click Annual -> Solo €40 (€3.33/mo)/ Family €80 (€6.67/mo)/ Pro
  €150 (€12.50/mo) «per year», Self-hosted μενει Free/forever. Active «Annual» btn = accent
  rgb(0,255,136) + dark ink (σωστο brand styling). (Screenshot black λογω 26000px-tall page· DOM+inspect
  authoritative.)
- Prerender: `billing-toggle`+«2 months free» στο index.html· «Operating entity, to confirm» στα
  privacy.html/terms.html. SSR default = monthly (useState false) -> zero regression χωρις JS.
- em-dash: 0 σε Pricing.tsx/page.tsx/terms/privacy/νεο CSS. (Pre-existing globals.css comment-header
  em-dashes ΔΕΝ τα αγγιξα.)
- Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call. Repo ΠΑΡΑΜΕΝΕΙ private (per χρηστη).

Επομενο increment: (e) polish — real app screenshots οταν υπαρξουν assets· ισως BreadcrumbList JSON-LD
στα /privacy /terms· annual Offers στο JSON-LD (τωρα μονο monthly).

Needs-Achilleas (open):
- **Legal entity name** (`[Operating entity, to confirm]`) + **payment processor** (τωρα Stripe): confirm
  ΠΡΙΝ hosted launch -> fill τις consts στα terms/privacy.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip `robots:{index:false}` -> indexable + sitemap.
- Contact inbox `hello@ph-aros.com` να επιβεβαιωθει.
- Hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: ο χρηστης το κρατα private προς το παρον (mbox ηδη out of reachable history).

## 2026-07-09 — (e) polish: BreadcrumbList JSON-LD στα /terms + /privacy

Increment (e) polish. Οι δυο legal σελιδες δεν ειχαν κανενα structured data (η homepage εχει πλουσιο
`@graph`: Organization/WebSite/SoftwareApplication+Offers/FAQPage/HowTo). Προσθεσα `BreadcrumbList`
JSON-LD (Home > Terms, Home > Privacy) σε καθε μια ωστε crawlers + AI answer engines να τις τοποθετουν
κατω απο το site root.

- `app/terms/page.tsx`: νεα const `SITE_URL='https://ph-aros.com'` (ελειπε, το privacy το ειχε ηδη) +
  `BREADCRUMB_LD` (2 ListItems) + `<script type="application/ld+json">` αμεσως μετα το skip-link
  (ιδιο pattern με την homepage).
- `app/privacy/page.tsx`: ιδιο `BREADCRUMB_LD` (reuse του υπαρχοντος SITE_URL) + script tag.
- Harmless οσο robots:{index:false}· χρησιμο μολις γινουν indexable (post legal-review flip).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, route set αμεταβλητο.
- Prerender: `grep BreadcrumbList` -> βρεθηκε στα .next/server/app/terms.html + privacy.html (×2 το καθενα:
  raw script + escaped).
- em-dash: 0 στα δυο edited files.
- Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call. Staged ΜΟΝΟ τα δυο δικα μου landing files +
  αυτο το log (τα foreign uncommitted files αλλων routines τα αφησα ασταγκα).

Επομενο increment: (e) polish συνεχεια — annual Offers στο homepage JSON-LD (τωρα μονο monthly
UnitPriceSpecification)· ή real app screenshots οταν υπαρξουν assets· ή content copy pass.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 — (e) polish: annual Offers στο homepage JSON-LD

Increment (e) polish, το explicit «επομενο» απο το προηγουμενο run. Το per-plan `Offer` JSON-LD (homepage
`@graph` -> SoftwareApplication.offers) εξεθετε ΜΟΝΟ monthly τιμη (ενα `UnitPriceSpecification`,
billingDuration 1), ενω το pricing UI εχει ηδη annual/monthly toggle (annual = monthly×10, 2 μηνες
δωρεαν). Ασυμφωνια: crawlers + AI answer engines εβλεπαν μονο τη μηνιαια τιμη.

- `app/page.tsx`: το `priceSpecification` καθε hosted Offer εγινε **array** με δυο `UnitPriceSpecification`
  nodes: (1) Monthly (price=amount, unitText MONTH, billingDuration 1), (2) Annual (price=amount×10,
  unitText ANN, billingDuration 12, name «Annual»). Το free self-host tier (amount '0') μενει χωρις
  priceSpecification (οπως πριν). Deterministic, `String(Number(t.amount)*10)` απο το υπαρχον TIERS array
  (single source of truth, μενει in-sync αν αλλαξουν οι τιμες). Μηδεν νεο dependency, μηδεν client JS.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, route set + / First Load JS αμεταβλητα (inline HTML script,
  μηδεν bundle impact).
- Prerender (`.next/server/app/index.html`): `"billingDuration":12` + `"unitText":"ANN"` present· annual
  τιμες «40» / «80» / «150» και οι τρεις παρουσες (Solo/Family/Pro × 10). Non-visual JSON-LD -> verified
  στο static output (ιδιο pattern με προηγουμενα SEO increments), δεν χρειαστηκε preview server.
- em-dash: 0 στο edited file. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec commit· τα foreign
  staged files αλλου routine (PROGRESS.md, apps/web/*) τα αφησα αθικτα (collision guard).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets (blocked)· ή content
copy pass· ή annual Offers και στα per-tier Pricing.tsx aria labels αν χρειαστει.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 (cont.) — (e) polish: 3 νεες FAQ (multi-user, updates, mobile)

Increment (e) polish, content pass αντι για ακομα ενα SEO-only run (τα προηγουμενα ηταν ολα JSON-LD).
Το FAQ ειχε 9 items αλλα ελειπαν 3 πολυ κοινες pre-purchase ερωτησεις. Προσθεσα στο `FAQS` array
(app/page.tsx) — αυτοματα τρεφουν και το ορατο accordion ΚΑΙ το FAQPage JSON-LD (maps πανω στο ιδιο array):

- «Can my household or team share one instance?» — login + accounts, self-host χωρις seat limits, hosted
  scale solo -> family/team. Συνεπες με τα Family/Pro tiers + το login/users που ηδη υπαρχει.
- «How do updates work?» — self-host: git pull + docker compose up (pin σε version)· hosted: auto rollout.
- «Is there a mobile app?» — native iOS/Android (Expo) που κανει sign-in στον δικο σου server. Ευθυγραμμισμενο
  verbatim με το υπαρχον #mobile section («native iOS and Android app, built with Expo»), οχι overpromise.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, / route 5.25 kB (μηδεν bundle impact, inline content).
- Prerender (.next/server/app/index.html): και οι 3 ερωτησεις ×5 occurrences (ορατο HTML + JSON-LD raw +
  escaped + deep-link anchors)· `FAQPage` present. Non-visual + static -> verified στο prerender οπως ολα
  τα προηγουμενα FAQ/JSON-LD increments (δεν σηκωσα preview server· separate non-Docker app).
- em-dash: 0 στο app/page.tsx. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· foreign staged
  files αλλου routine (apps/web/receiptSearch*, search-actions.ts) τα αφησα αθικτα (collision guard).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets (blocked)· ή ακομα
content copy pass (π.χ. features micro-copy)· ή annual Offers στα per-tier Pricing.tsx aria labels.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 (cont.²) — (e) polish/a11y: live-region για το billing toggle

Increment (e) polish, accessibility pass (τα προηγουμενα 3 runs ηταν JSON-LD + FAQ content). Το Pricing
billing toggle (Monthly/Annual) αλλαζει τις τιμες in place στις καρτες, αλλα δεν υπηρχε καμια αναγγελια
σε screen readers: ενας AT χρηστης που πατα «Annual» δεν ακουγε οτι τα νουμερα απο κατω αλλαξαν. Μηδεν
`aria-live` σε ολο το app (grep=0) πριν απο αυτο.

- `app/components/Pricing.tsx`: νεο `.sr-only` `<p role="status" aria-live="polite">` κατω απο το toggle,
  που announce-αρει «Showing annual pricing: pay for 10 months, get 2 months free.» / «Showing monthly
  pricing.» οταν flip-αρει το `annual` state. Reuse του υπαρχοντος `.sr-only` utility (globals.css:1089),
  μηδεν νεο CSS, μηδεν νεο dependency, μηδεν bundle impact (ιδιο client component).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, / route 5.31 kB (αμελητεο +0.06 kB, inline text).
- Prerender (.next/server/app/index.html): «Showing monthly pricing» present (default state) + ενα
  `aria-live="polite"`. Non-visual a11y region -> verified στο static output (ιδιο pattern με τα προηγουμενα
  non-visual increments· separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 στο Pricing.tsx. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (Pricing.tsx + αυτο το log) μεσω explicit pathspec· foreign staged
  files αλλου routine (apps/web/receiptSearch*, search-actions.ts) τα αφησα αθικτα (collision guard).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets (blocked)· ή aria-live
και στο Waitlist submit feedback αν λειπει· ή content copy micro-pass στα features.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 (cont.³) — (e) polish/sync: annual billing στο llms.txt (AI-crawler parity)

Increment (e) polish, sync pass. Το `public/llms.txt` (AI-crawler summary) στην ενοτητα Pricing εδειχνε
ΜΟΝΟ monthly τιμες (€4/€8/€15), αλλα η σελιδα προσφερει πλεον προμιναντ και annual billing: ο Pricing
toggle (Monthly/Annual), το JSON-LD annual Offers (×10, δυο μηνες δωρεαν) και το pricing footnote. Ενας
AI crawler που διαβαζε το llms.txt εχανε εντελως την annual επιλογη -> stale/ελλιπες summary.

- `public/llms.txt`: νεα παραγραφος κατω απο το Pro tier — annual = 10 μηνες προπληρωμη (2 μηνες δωρεαν/ετος),
  με τις concrete ετησιες τιμες (Solo €40, Family €80, Pro €150) + «includes AI parsing and nightly backups,
  cancel anytime». Ευθυγραμμισμενο verbatim με το JSON-LD (amount ×10) και το ορατο pricing footnote.

Verify:
- `npm run type-check` -> exit 0 (static txt δεν type-check-αρεται, αλλα καθαρο).
- `npm run build` -> success, route set αμεταβλητο (public/*.txt αντιγραφονται ως-εχουν, μηδεν bundle impact).
- Served-file check: `grep "Annual billing charges ten months"` -> 1 occurrence στο public/llms.txt.
- em-dash: 0 στο llms.txt. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (public/llms.txt + αυτο το log) μεσω explicit pathspec· foreign
  staged files αλλου routine (apps/web/search-actions.ts, receiptSearch*) τα αφησα αθικτα (collision guard,
  0 staged πριν το commit).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets (blocked)· ή Waitlist
always-present aria-live region (το status note render-αρεται μονο μετα το sent, ισως δεν announce-αρεται
απο ολους τους AT)· ή content micro-pass στα features.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 (cont.⁴) — (e) polish/a11y: always-present live region στο Waitlist submit

Increment (e) polish, accessibility. Το Waitlist submit feedback («Your email app should be opening…»)
render-αροταν ΜΟΝΟ αφου `sent` γινοταν true, δηλαδη το `role="status"` element μπαινε στο DOM μαζι με το
κειμενο του. Πολλα screen readers ΔΕΝ announce-αρουν live region που mount-αρεται ταυτοχρονα με το
περιεχομενο του: το live region πρεπει να προϋπαρχει στο DOM και μετα να αλλαξει το text του για να
πυροδοτησει announcement. Αρα ο AT χρηστης που πατουσε «Join the waitlist» μπορει να μην ακουγε τιποτα.

- `app/components/Waitlist.tsx`: νεο ALWAYS-mounted `.sr-only` `<p role="status" aria-live="polite">` στην
  κορυφη της φορμας· κενο by default, populate-αρεται με «Opening your email app to write to
  hello@ph-aros.com.» οταν `sent` -> true. Reuse του υπαρχοντος `.sr-only` utility, μηδεν νεο CSS/dependency.
- Αφαιρεσα το `role="status"` απο το ΟΡΑΤΟ `waitlist-note` (μενει ως πλην visible text) ωστε να μην γινεται
  διπλο announcement (visible note + sr-only region).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, / route 5.33 kB (+0.02 kB, inline text, αμελητεο).
- Prerender (.next/server/app/index.html): 2× `aria-live="polite"` (Pricing billing toggle + νεο Waitlist)
  + 2× `role="status"`. Το Waitlist sr-only region προϋπαρχει στο static output (κενο, sent=false) -> η
  always-present απαιτηση επιβεβαιωμενη στο prerender. Non-visual a11y -> verified static output οπως τα
  προηγουμενα non-visual increments (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 στο Waitlist.tsx. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (Waitlist.tsx + αυτο το log) μεσω explicit pathspec· foreign staged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*, WorkspaceShell/chooseWorkspace/SignOut)
  τα αφησα αθικτα (collision guard, 0 staged πριν το commit).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets (blocked)· ή reduced-motion
audit (pulsing beacon/scroll-progress σε `prefers-reduced-motion`)· ή content micro-pass στα features.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 (cont.⁵) — (e) polish/a11y: hide scroll-progress beam σε reduced-motion

Increment (e) polish, reduced-motion audit (το προηγουμενο run εβαλε aria-live στο Waitlist). Σαρωσα ολο
το motion surface: το μονο infinite animation ειναι το `.beacon` (ηδη `animation:none` σε reduced-motion),
το `scroll-behavior` γινεται `auto`, οι JS smooth-scrolls (BackToTop/FaqDeepLink) ελεγχουν το reduce flag,
και το universal nuke rule (`transition-duration:0.01ms !important`) σκοτωνει καθε glide. Ενα genuine κενο
εμεινε: το `.scroll-progress` beam (glowing accent->cyan bar, JS scaleX ανα scroll) ειναι decorative
(aria-hidden) αλλα εξακολουθει να ολισθαινει οπτικα καθως scroll-αρεις. WCAG 2.3.3 (Animation from
Interactions): non-essential motion πυροδοτημενο απο scroll πρεπει να ειναι avoidable, και το native
scrollbar ηδη δειχνει reading position.

- `app/globals.css`: στο `@media (prefers-reduced-motion: reduce)` block, νεο `.scroll-progress{display:none}`
  (κρυβει ολοκληρο το beam για reduced-motion χρηστες). Μηδεν νεο CSS αλλου, μηδεν JS αλλαγη (ο
  ScrollProgress component μενει ως-εχει, απλα το container του κρυβεται), μηδεν dependency, μηδεν bundle impact.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, / route 5.33 kB (αμεταβλητο, CSS-only).
- Compiled CSS (.next/static/css): `.scroll-progress{display:none}` present μεσα στο reduced-motion block.
  Non-visual/media-query a11y -> verified στο minified output οπως τα προηγουμενα non-visual increments
  (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: το comment που προσθεσα χρησιμοποιει μονο commas/colon/parentheses (τα 4 em-dashes στο globals.css
  ειναι pre-existing, οχι δικα μου). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (globals.css + αυτο το log) μεσω explicit pathspec· foreign unstaged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*) τα αφησα αθικτα (collision guard, 0 staged
  πριν το commit).

Επομενο increment: (e) polish συνεχεια — real app screenshots οταν υπαρξουν assets (blocked)· ή content
micro-pass στα features (micro-copy)· ή annual Offers στα per-tier Pricing aria labels.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον.

## 2026-07-10 (cont.⁶) — (e) polish/SEO: pre-launch Offer availability (InStock -> PreOrder)

Increment (e) polish, structured-data correctness. Το JSON-LD `SoftwareApplication.offers` δηλωνε ολα τα
tiers ως `availability: schema.org/InStock`, αλλα τιποτα ΔΕΝ ειναι αγοραστο ακομα: το self-host repo ειναι
private (`REPO_PUBLIC=false`, οι CTAs κουβαλανε «soon» badge) και τα hosted plans (Solo/Family/Pro) ειναι
waitlist-only («Join the waitlist»). Το να λες σε search engines «InStock» για κατι μη-αγοραστο ειναι
misleading και μπορει να πυροδοτησει rich-result penalty (Google Merchant/rich results ελεγχουν availability).

- `app/page.tsx` (JSON_LD offers map): νεα availability λογικη που αντικατοπτριζει το πραγματικο pre-launch
  state. Free self-host tier (amount '0') -> `InStock` ΜΟΝΟ οταν `REPO_PUBLIC` (αλλιως `PreOrder`), ωστε να
  auto-corrects τη στιγμη που ανοιξει το repo. Paid hosted tiers (amount != '0') -> παντα `PreOrder` οσο ειναι
  waitlist-gated. Μονο comment + η μια ternary αλλαξαν, μηδεν copy/UI/CSS change, μηδεν dependency.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, / route 5.33 kB (αμεταβλητο, JSON-LD-only).
- Prerender (.next/server/app/index.html): `"availability":"schema.org/InStock"` -> 0 occurrences (σωστο, ολα
  pre-launch)· `schema.org/PreOrder` -> 4 offers (free + Solo/Family/Pro), 8 raw hits (Next εμφανιζει το JSON-LD
  και στο script tag ΚΑΙ στο RSC payload -> ×2, consistent). Structured-data/non-visual -> verified στο static
  output οπως τα προηγουμενα non-visual increments (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 στην περιοχη που edit-αρα. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ το δικο μου landing file (app/page.tsx + αυτο το log) μεσω explicit pathspec· foreign unstaged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*) τα αφησα αθικτα (collision guard, 0 staged
  πριν το commit).

Επομενο increment: (e) polish συνεχεια — οταν REPO_PUBLIC γινει true, το InStock θα ενεργοποιηθει αυτοματα
για το free tier (no code change)· ή content micro-pass στα features· ή real app screenshots οταν υπαρξουν
assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.⁷) — (e) polish/content: Features copy ευθυγραμμιση με 2 shipped capabilities (P32, P33)

Increment (e) polish, content-accuracy micro-pass. Δυο modules ειχαν αποκτησει νεες δυνατοτητες στο κυριο app
(git log) που το landing ΔΕΝ αντικατοπτριζε ακομα:
- Vouchers: gift-card / store-credit **balance tracker** (P32, commit 052ee64).
- Subscriptions: **free-trial cancel-before-charge reminder** (P33, commit bfd96ba).

Αλλαγες (app/page.tsx, FEATURES array μονο, μηδεν UI/CSS/dependency/bundle change):
- Subscriptions desc: προστεθηκε «plus free-trial reminders that ping you to cancel before the first charge
  lands.» (πριν σταματουσε στο renewal calendar).
- Vouchers desc: «with expiry reminders» -> «track the balance left on each one, and get expiry reminders
  before value slips away» (αντικατοπτριζει το balance tracker + κραταει το expiry reminder).
Και τα δυο ειναι ακριβη σε πραγματικα-shipped features, οχι roadmap. Δεν αγγιξα ROADMAP/FAQ/Pricing.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static, / route 5.33 kB (αμεταβλητο, copy-only).
- Prerender (.next/server/app/index.html): «track the balance left on each one» + «free-trial reminders that
  ping you to cancel» -> present. Content/non-visual -> verified στο static output (separate non-Docker app,
  δεν σηκωσα preview server).
- em-dash: 0 στα δυο strings που edit-αρα (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· foreign unstaged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*) τα αφησα αθικτα (collision guard).

Επομενο increment: (e) polish συνεχεια — reconciliation (receipt <-> transaction, P18) ισως αξιζει μια FAQ
γραμμη· ή annual Offers στα per-tier Pricing aria labels· ή real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.⁸) — (e) polish/content: Reports feature copy += safe-to-spend forward cashflow (P19)

Increment (e) polish, content-accuracy micro-pass. Το Reports module απεκτησε νεα δυνατοτητα στο κυριο app
(git log: d3e191d feat(reports): safe-to-spend forward cashflow (P19), shipped) που το landing ΔΕΝ
αντικατοπτριζε: forward-looking safe-to-spend view (projected cashflow μετα τα upcoming bills).

Αλλαγη (app/page.tsx, FEATURES array μονο, μηδεν UI/CSS/dependency/bundle change):
- Reports desc: προστεθηκε «plus a forward safe-to-spend view that projects what is left after upcoming
  bills» αναμεσα στα charts και στο κλεισιμο «See where the money actually goes.». Ακριβες σε real-shipped
  feature, οχι roadmap.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, 13/13 static (wait: 11 routes shown), / route 5.33 kB (αμεταβλητο, copy-only).
- Prerender (.next/server/app/index.html): «forward safe-to-spend view that projects» -> 2 hits (script tag +
  RSC payload, consistent). Content/non-visual -> verified στο static output (separate non-Docker app, δεν
  σηκωσα preview server).
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· collision guard πριν
  το commit.

Επομενο increment: (e) polish συνεχεια — reconciliation (receipt <-> transaction, P18) ισως αξιζει μια FAQ
γραμμη· ή annual Offers στα per-tier Pricing aria labels· ή real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.⁹) — (e) polish/content: Statements += receipt reconciliation (P18), Expenses += budget envelope rollover (P25)

Increment (e) polish, content-accuracy micro-pass. Δυο modules απεκτησαν shipped δυνατοτητες στο κυριο app
(git log) που το landing FEATURES ΔΕΝ αντικατοπτριζε:
- Statements: receipt <-> transaction reconciliation (P18, commit 07fba9f) — deterministic auto-SUGGEST
  match αποδειξεων στις χρεωσεις ενος εκκαθαριστικου (ποσο ±€0.02, ημερομηνια ±3 μερες), με confirm.
- Expenses: budget envelope / rollover mode (P25, commit 9dabfe9) — opt-in carry του net-unspent budget
  καθε κατηγοριας απο προηγουμενους μηνες στον τρεχοντα (classic per-month budgets μενει το default).

Αλλαγες (app/page.tsx, FEATURES array μονο, μηδεν UI/CSS/dependency/bundle change):
- Statements desc: «...merge the same purchase across months. Always know what you still owe.» ->
  «...merge the same purchase across months. Reconcile charges against your receipts, and always know what
  you still owe.»
- Expenses desc: «...Budgets per category.» -> «...Budgets per category, with optional envelope rollover so
  an unspent month carries forward.»
Και τα δυο ακριβη σε real-shipped features (οχι roadmap). Δεν αγγιξα ROADMAP/FAQ/Pricing/JSON-LD.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (/ route αμεταβλητο, copy-only, μηδεν bundle impact).
- Prerender (.next/server/app/index.html): «Reconcile charges against your receipts» + «envelope rollover so
  an unspent month carries forward» -> και τα δυο present. Content/non-visual -> verified στο static output
  (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· collision guard
  πριν το commit.

Επομενο increment: (e) polish συνεχεια — reconciliation ισως αξιζει και μια FAQ γραμμη («does it match my
receipts to card charges?»)· ή annual Offers στα per-tier Pricing aria labels· ή real app screenshots οταν
υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.¹⁰) — (e) polish/content: FAQ += receipt<->charge reconciliation (P18)

Increment (e) polish, content-accuracy micro-pass. Το FAQ ειχε ερωτησεις για reading receipts/statements
αλλα ΚΑΜΙΑ για το reconciliation (P18, shipped) που τωρα το FEATURES Statements desc αναφερει. Κενο: ενας
επισκεπτης που ρωταει «ταιριαζει τις αποδειξεις μου στις χρεωσεις;» δεν εβρισκε απαντηση.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency change):
- Νεα FAQ εγγραφη «Does it match my receipts to card charges?» αμεσως μετα το «Can it read receipts and
  statements I already have?». Απαντηση: statement import -> suggest ποιες αποδειξεις ανηκουν σε καθε χρεωση
  (amount ±λιγα λεπτα, date ±λιγες μερες), confirm -> reconcile ενος μηνα σε λιγα κλικ. Ακριβες σε
  real-shipped feature (P18, commit 07fba9f).
- Η εγγραφη ρεει αυτοματα και στο FAQPage JSON-LD (FAQS.map) + παιρνει deterministic anchor id
  `faq-does-it-match-my-receipts-to-card-charges` (deep-link stays valid).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static, / route 5.33 kB (αμεταβλητο, copy-only, μηδεν bundle impact).
- Prerender (.next/server/app/index.html): «which of your receipts each charge belongs» -> 2 hits (HTML +
  RSC payload, consistent)· anchor id `faq-does-it-match-my-receipts-to-card-charges` present. Content/
  non-visual -> verified στο static output (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· foreign unstaged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*) τα αφησα αθικτα (collision guard).

Επομενο increment: (e) polish συνεχεια — annual Offers στα per-tier Pricing aria labels· ή bill/payable
tracker (P28, shipped) ισως αξιζει μια Expenses copy γραμμη ή FAQ· ή real app screenshots οταν υπαρξουν
assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.¹¹) — (e) polish/content: FAQ += manual bills / payables tracker (P28)

Increment (e) polish, content-accuracy micro-pass. Το πιο προσφατο shipped module στο κυριο app (P28,
commit a737bbc `feat(bills)` + cd296b8 docs) ΔΕΝ ειχε καμια αντιστοιχια στο landing: νεο `/bills` module για
λογαριασμους που πληρωνεις με το χερι (ΔΕΗ, ΟΤΕ, κοινοχρηστα), ΞΕΧΩΡΙΣΤΟ απο τα Subscriptions (automatic
charge) — status due-soon/overdue/paid DERIVED απο dueDate + paidAt, triage list, one-click mark-paid (opt-in
log matching expense), recurring bill spawns την επομενη instance, bill-due alerts (billAlertDays, default 5).
Ενας επισκεπτης που ρωταει «παρακολουθει τους λογαριασμους που πληρωνω χειροκινητα;» δεν εβρισκε απαντηση, και
το Expenses FEATURES desc («Bills and payslips scanned») μπορει να μπερδεψει bills=scanned-expense με το
payable tracker.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα FAQ εγγραφη «Does it track bills I pay by hand, like utilities?» αμεσως πριν το «How do backups work?»
  (money-tracking cluster, μετα το reconciliation Q). Απαντηση: manual bills → δικος τους tracker, ξεχωριστος
  απο τα subscriptions· κινειται due-soon/overdue/paid απο το due date· triage list· one-click mark-paid +
  optional log expense· recurring bill queues την επομενη· reminders λιγες μερες πριν. Ακριβες σε real-shipped
  feature (P28).
- Ρεει αυτοματα στο FAQPage JSON-LD (FAQS.map) + deterministic anchor id
  `faq-does-it-track-bills-i-pay-by-hand-like-utilities` (deep-link stays valid).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes), / route 5.33 kB (αμεταβλητο, copy-only, μηδεν bundle
  impact).
- Prerender (.next/server/app/index.html): «Bills you pay manually» -> 4 hits (HTML + JSON-LD + RSC payload +
  deep-link, consistent)· anchor id `faq-does-it-track-bills-i-pay-by-hand-like-utilities` present.
  Content/non-visual -> verified στο static output (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· foreign unstaged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*) τα αφησα αθικτα (collision guard).

Επομενο increment: (e) polish συνεχεια — P34 per-space / per-property ledger tag (split expenses ανα σπιτι,
«ποσο κοστιζει το εξοχικο») ισως αξιζει μια Reports/Expenses copy γραμμη ή FAQ (relevant στον 2-homes /
homelabber persona)· ή annual Offers στα per-tier Pricing aria labels· ή real app screenshots οταν υπαρξουν
assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.¹²) — (e) polish/content: FAQ += per-space / per-property ledger split (P34)

Increment (e) polish, content-accuracy micro-pass. Το P34 (shipped, commit 6b1de5c `feat(expenses)`) εδωσε
optional `space` (ledger) tag στα expenses/income ωστε τα χρηματα να split-αρονται ανα property/context
(κεντρικο σπιτι vs εξοχικο), με per-space Reports breakdown («ποσο κοστιζει το εξοχικο»). Ηταν το ρητο
«επομενο increment» απο το cont.¹¹, και ειναι ΑΜΕΣΑ relevant στον 2-homes profile του Achilleas (κεντρικο +
εξοχικο Καλαμος) + στον homelabber persona. Κανενα section του landing δεν ανεφερε αυτη τη δυνατοτητα.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα FAQ εγγραφη «Can I split spending across more than one home or property?» αμεσως πριν το «How do
  backups work?» (money-tracking cluster, μετα το bills Q). Απαντηση ακριβης σε real-shipped feature: tag
  εξοδου/εσοδου σε space, sidebar filter, per-space Reports breakdown, recurring bill κραταει το space στο
  scan (ΔΕΗ εξοχικου μενει tagged), dormant μεχρι να προσθεσεις space (μηδεν forced tagging).
- Ρεει αυτοματα στο FAQPage JSON-LD (FAQS.map) + deterministic anchor id
  `faq-can-i-split-spending-across-more-than-one-home-or-property` (deep-link stays valid).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes), / route 5.33 kB (αμεταβλητο, copy-only, μηδεν bundle
  impact).
- Prerender (.next/server/app/index.html): «how much does the cottage cost» -> 4 hits (HTML + JSON-LD + RSC
  payload + deep-link, consistent)· anchor id `faq-can-i-split-spending-across-more-than-one-home-or-property`
  present. Content/non-visual -> verified στο static output (separate non-Docker app, δεν σηκωσα preview
  server).
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec· foreign unstaged
  files αλλου routine (apps/web/search-actions.ts, receiptSearch*, SAAS_PROGRESS.md, docs/*) τα αφησα αθικτα
  (collision guard).

Επομενο increment: (e) polish συνεχεια — annual Offers στα per-tier Pricing aria labels· ή expense-splitting
/ «who owes what» (P35, shipped) ισως αξιζει μια Expenses copy γραμμη ή FAQ· ή real app screenshots οταν
υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-10 (cont.¹³) — (e) polish/content: FAQ += expense splitting / "who owes what" (P35)

Increment (e) polish, content-accuracy micro-pass. Ητο ο ρητος «επομενο increment» απο το cont.¹²: το P35
(shipped, commit 26eed90 `feat(expenses)` + 779feae docs) εδωσε Splitwise-lite expense splitting μεσα στη
φορμα εξοδου, και ΚΑΝΕΝΑ section του landing δεν το ανεφερε. Διαβασα το πραγματικο feature (docs/features.md
+ commit body) πριν γραψω, καμια εφευρεση.

Feature convention (verbatim απο code): ΕΣΥ πληρωσες το total· καθε split row = αλλο ατομο (free-form name,
ΟΧΙ Pharos account) που σου χρωσταει το share· settled = σου το εδωσε πισω· δικο σου μεριδιο implicit
(total − Σ shares). Split editor («Split equally» + count-me-in, live your-share/owed, mark paid-back),
split badge (amount owed) σε cards/rows, «Balances, who owes you» modal (per-person aggregate) + settlePerson
(one-click settle ολων των shares ενος ατομου cross-expense). Dormant μεχρι να προσθεσεις split.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα FAQ εγγραφη «Can it split a shared cost and track who owes me?» αμεσως πριν το «How do backups work?»
  (money-tracking cluster, μετα το per-space/property Q). Απαντηση ακριβης: add people by name (no account),
  set share ή «Split equally» + slice for yourself, badge με owed, «Balances, who owes you» per-person total,
  one-click settle-up cross-expense, dormant μεχρι να split-αρεις.
- Ρεει αυτοματα στο FAQPage JSON-LD (FAQS.map) + deterministic anchor id
  `faq-can-it-split-a-shared-cost-and-track-who-owes-me` (deep-link stays valid).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes), / route 5.33 kB (αμεταβλητο, copy-only, μηδεν bundle
  impact).
- Prerender (.next/server/app/index.html): «who owes me» -> 5 hits, «Balances, who owes you» -> 4 hits
  (HTML + JSON-LD + RSC payload + deep-link, consistent)· anchor id
  `faq-can-it-split-a-shared-cost-and-track-who-owes-me` present. Content/non-visual -> verified στο static
  output (separate non-Docker app, δεν σηκωσα preview server).
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Staged ΜΟΝΟ τα δικα μου landing files (page.tsx + αυτο το log) μεσω explicit pathspec (collision guard).

Επομενο increment: (e) polish συνεχεια — annual Offers στα per-tier Pricing aria labels· ή real app
screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο shipped module αν εμφανιστει gap.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 — (e) polish/content: ROADMAP accuracy fix + FAQ += insurance export (P13)

Increment (e) πριν το ξεκινημα του run, διαβασα ολοκληρο το `git log --oneline -40` του κυριου app (οχι
μονο features.md) και βρηκα κατι σοβαρο: το `ROADMAP` section («Exploring, on the backlog, not yet
scheduled») εδειχνε 3 στοιχεια, αλλα τα 2 απο τα 3 ειχαν **ηδη ship-αρει** εδω και καιρο:
- «IMAP email-in for hands-off receipt capture» = P11 (commit `3a7be9b feat(receipts)`, τεκμηριωμενο στο
  `docs/features.md:113`).
- «Savings goals & insurance export» = δυο ξεχωριστα shipped features: savings goals = P12
  (`docs/features.md:355`, ηδη παλιοτερο)· insurance export = P13, εγινε ship **σημερα** (commit `7373035
  feat(items): home-inventory insurance export bundle`, ~2.5 ωρες πριν αυτο το run).
Μονο το «Return-window reminders for recent buys» (P10 candidate, καμια αναφορα πουθενα στο features.md)
ειναι πραγματικα ακομα backlog. Το να δειχνεις σε επισκεπτες live features σαν «not yet scheduled» ειναι
ενα content-accuracy/trust θεμα (υποτιμα το προιον) και το ζητησε ρητα το προηγουμενο log entry
(«ή νεοτερο shipped module αν εμφανιστει gap»).

Αλλαγη (app/page.tsx, μονο 2 arrays + 1 FAQ, μηδεν UI/CSS/dependency change):
- `ROADMAP`: αφαιρεθηκαν τα 2 ηδη-shipped bullets απο το `Exploring` array· προστεθηκε ΕΝΑ νεο bullet
  στο `Shipped` array («IMAP email-in, savings goals & insurance export bundle»)· το `Exploring` εμεινε με
  το μοναδικο πραγματικα-ανοιχτο στοιχειο (return-window reminders), ειναι εντιμο ετσι με 1 item.
- `FAQS`: νεα εγγραφη «Can it produce an export for an insurance claim?» αμεσως πριν το «How do backups
  work?» (money/data cluster). Απαντηση ακριβης απο το commit body του P13: Settings → Storage & backup →
  «Insurance export (ZIP)», CSV manifest + standalone printable HTML report ανα item (value/serial/
  warranty) + photos/manuals/linked receipts, ιδιο depreciation-adjusted value estimate με τα Reports.
  Ρεει αυτοματα στο FAQPage JSON-LD + deterministic anchor id
  `faq-can-it-produce-an-export-for-an-insurance-claim`.
- Savings goals (P12) και IMAP email-in (P11) ΔΕΝ πηραν δικο τους FAQ σε αυτο το increment (μονο
  roadmap-bucket fix)· μενουν σαν πιθανα επομενα increments αν χρειαστει βαθυτερη coverage.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes), `/` route 5.33 kB (αμεταβλητο, copy-only, μηδεν
  bundle impact).
- Prerender (`.next/server/app/index.html`): «IMAP email-in, savings goals» -> 3 hits· «Insurance export
  (ZIP)» -> 1 hit· «insurance claim?» -> 3 hits (HTML + JSON-LD + RSC payload, consistent)· anchor id
  `faq-can-it-produce-an-export-for-an-insurance-claim` present.
- Browser preview (in-app Browser, νεο tool αυτο το session): `preview_start` στο apps/landing (port 3100,
  χωρις launch.json entry, next dev standalone), `get_page_text` επιβεβαιωσε ολο το ROADMAP section
  (Shipped/Building/Exploring με τα σωστα bullets) + το νεο FAQ item ρεουν σωστα στο rendered DOM, μηδεν
  console errors (`read_console_messages` καθαρο). Server σταματησε μετα (`preview_stop`), δεν εμεινε
  τιποτα τρεχει.
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το commit εδειξε 4 foreign paths αλλου routine
  (`apps/web/src/app/(saas)/account/workspace/settings/page.tsx` + 3 νεα `apps/web/src/components/saas/
  AiKeyPanel*`), κανενα σταθηκε (`git diff --cached --name-only` κενο)· staged ΜΟΝΟ τα δικα μου landing
  paths μεσω explicit pathspec.

Επομενο increment: (e) polish συνεχεια — μπορει να αξιζει δικο του FAQ/copy line για savings goals (P12)
ή IMAP email-in (P11) αν δεν καλυφθουν αλλου· annual Offers στα per-tier Pricing aria labels· ή real app
screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο shipped module αν εμφανιστει gap.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 (cont.) — (e) polish/content: FAQ += tax-deductible tagging & year-end export (P8)

Increment (e). Διαβασα το `git log --oneline -15` του κυριου repo και το `docs/features.md` πριν γραψω· το
P8 «Tax-deductible tagging & year-end export» ship-αρε σημερα (commit `e0124d8 feat(expenses)`, ~λιγες ωρες
πριν αυτο το run, αμεσως πριν το προηγουμενο landing commit `11331cd`) και δεν ειχε ΚΑΜΙΑ αναφορα πουθενα
στο landing (grep για "tax" στο page.tsx = μηδεν hits πριν το increment). Καθαρο gap, ιδιο cluster με το
insurance-export FAQ που προστεθηκε στο προηγουμενο run.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα FAQ εγγραφη «Can it help with tax filing at year-end?» αμεσως μετα το «Can it produce an export for
  an insurance claim?» (money/data cluster, πριν το backups Q). Απαντηση ακριβης απο το
  `docs/features.md:189-207`: tax-deductible toggle (inherited σε recurring series), free-form tax
  category, «Tax-deductible only» filter + gold badge, year-end «Tax export (ZIP)» απο Settings -> Backup
  (CSV grouped by category + printable HTML report + κάθε linked receipt/bill).
- Ρεει αυτοματα στο FAQPage JSON-LD (FAQS.map) + deterministic anchor id
  `faq-can-it-help-with-tax-filing-at-year-end` (deep-link stays valid).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes, αμεταβλητο)· `/` route 5.33 kB, αμεταβλητο, copy-only,
  μηδεν bundle impact.
- Prerender (`.next/server/app/index.html`): «help with tax filing at year-end» -> 2 hits (HTML + JSON-LD)·
  anchor id `faq-can-it-help-with-tax-filing-at-year-end` present.
- Browser preview (in-app Browser): port 3100 ηταν κατειλημμενο απο αλλη (ασχετη) Docker διεργασια, χρησι-
  μοποιηθηκε port 3101 (`next dev -p 3101`)· `get_page_text` επιβεβαιωσε την πληρη ερωτηση+απαντηση στο
  rendered DOM (μετα το insurance-claim item, πριν το backups item), σωστη σειρα· `read_console_messages`
  onlyErrors καθαρο· mobile viewport (375px) render OK (ασχετο section, μηδεν breakage). Server σταματησε
  μετα (`pkill`), δεν εμεινε τιποτα τρεχει.
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το commit εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` (κανενα
  foreign staged/unstaged path αλλου routine αυτη τη φορα)· staged ΜΟΝΟ τα δικα μου landing paths μεσω
  explicit pathspec.

Επομενο increment: (e) polish συνεχεια — savings goals (P12) ή IMAP email-in (P11) FAQ αν δεν καλυφθουν
αλλου (αναφερονται μονο στο Roadmap/Shipped bullet, οχι σε δικο τους FAQ)· annual Offers στα per-tier
Pricing aria labels· ή real app screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο shipped module αν
εμφανιστει gap.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 (cont.²) — (e) polish/content: FAQ += permanent account deletion / GDPR erasure (P76)

Increment (e). Πριν το ξεκινημα διαβασα `git log --oneline -20` του κυριου repo (οχι μονο features.md,
οπως ζητησε ρητα το προηγουμενο log entry) και βρηκα το πιο προσφατο commit: `a2e6923 feat(saas): GDPR
erasure self-service UI for workspace settings (increment 76)`, ship-αρε σημερα λιγες ωρες πριν αυτο το
run, τεκμηριωμενο στο `docs/saas.md:475` («Delete workspace UI (settings page)»). Καθαρο content gap:
`grep -i "gdpr\|erasure\|delete my account"` στο page.tsx = μηδεν hits πριν το increment.

Τι ειναι το feature (απο docs/saas.md + `apps/web/src/lib/tenancy/erasure.ts`): owner-only «Delete
workspace» danger-zone panel στο `/account/workspace/<slug>/settings`. Δυο states: not-requested (κουμπι
«Delete workspace» + confirm dialog) και requested (κουμπι «Cancel deletion» + live countdown
«N days left» / «due for deletion now»). Grace window = **30 μερες** (`ERASURE_GRACE_DAYS = 30` στο
erasure.ts), reversible μεχρι να κλεισει το παραθυρο.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα FAQ εγγραφη «Can I permanently delete my account and all its data?» **τελευταια** στο FAQS array
  (μετα το «Is my financial data secure?», κλεινει το money/data/security cluster). Απαντηση: hosted path
  (owner-only «Delete workspace» control, 30-day grace window, cancel any time) + self-hosted equivalent
  (δεν υπαρχει server-side account καθολου, deletion = αφαιρεση των δικων σου Docker volumes).
- Δεν αγγιξα το ROADMAP array: το feature ειναι hosted-only υπο-χαρακτηριστικο του ηδη υπαρχοντος
  «Building» bullet «Managed multi-tenant hosted edition» (οπως και τα BYO-AI-key/GDPR-adjacent SaaS
  αυξηματα πριν απο αυτο), δεν χρειαζεται δικο του roadmap bullet.
- Ρεει αυτοματα στο FAQPage JSON-LD (FAQS.map) + deterministic anchor id
  `faq-can-i-permanently-delete-my-account-and-all-its-data`.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes, αμεταβλητο)· `/` route 5.33 kB, αμεταβλητο (copy-only).
- Prerender (`.next/server/app/index.html`): «delete my account and all its data» -> 5 hits, «30-day grace
  window» -> 4 hits, anchor id `faq-can-i-permanently-delete-my-account-and-all-its-data` -> 5 hits (HTML +
  JSON-LD + RSC payload, consistent).
- Browser preview (in-app Browser, port 3100 ηταν κατειλημμενο απο **Docker** αυτη τη φορα οχι απο stale
  next-dev process — `lsof` εδειξε `com.docke` listening· χρησιμοποιηθηκε port 3102 καθαρο): `get_page_text`
  επιβεβαιωσε ολο το FAQ section rendering σωστα· `javascript_tool` επιβεβαιωσε το πληρες text content του
  νεου anchor στο live DOM· `read_console_messages` onlyErrors καθαρο· mobile viewport (375px) screenshot
  δειχνει το νεο item σωστα τοποθετημενο ως τελευταιο FAQ, πριν το «Hosted beta» waitlist CTA, μηδεν
  overflow/breakage. Server σταματησε μετα (`pkill`), δεν εμεινε τιποτα τρεχει.
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το commit εδειξε ΜΟΝΟ `apps/landing/app/page.tsx`, `git diff
  --cached --name-only` κενο πριν το add· staged+committed ΜΟΝΟ το δικο μου landing path.
- Commit `f5a3d2e`, pushed καθαρα (`4b518d4..f5a3d2e main -> main`), κανενα rebase χρειαστηκε.

Επομενο increment: (e) polish συνεχεια — savings goals (P12) ή IMAP email-in (P11) δικο τους FAQ αν
δεν καλυφθουν αλλου (τωρα μονο σε Roadmap/Shipped bullet)· annual Offers στα per-tier Pricing aria
labels· ή real app screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο shipped module αν εμφανιστει
gap (τσεκαρε `git log --oneline -20` του κυριου repo στην αρχη καθε run, οχι μονο features.md/saas.md).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 (cont.³) — (e) polish/content: FAQ += savings goals (P12)

Increment (e). Πριν το ξεκινημα διαβασα `git log --oneline -25` του κυριου repo (οχι μονο features.md) —
τα νεοτερα commits ηταν `00216c7 feat(saas)` dev-token invite link (increment 77, internal-facing dev/
onboarding UX, δεν ειναι user-facing feature αξιο FAQ) και `20cd073 feat(mobile)` net-worth στο mobile
Reports (parity fix, το net-worth ηδη καλυπτεται στο landing μεσω αλλων σημειων/mockup, οχι νεο feature).
Κανενα απο τα δυο ηταν landing gap. Το προηγουμενο log entry ομως ειχε ηδη επισημανει gap: savings goals
(P12) και IMAP email-in (P11) εμφανιζονται ΜΟΝΟ σαν bullet μεσα στο Shipped-roadmap string («IMAP email-in,
savings goals & insurance export bundle»), χωρις δικο τους FAQ. Διαλεξα το savings goals (πιο καθαρο,
αυτοτελες feature απο το IMAP email-in που ειναι self-hosted-only technicality).

Τι ειναι το feature (`docs/features.md:384-387`, commit `78ebd76 feat(reports)`): στο /reports, savings
goals (target amount + optional deadline, π.χ. «€5000 for new laptop by 2026-12-31»), progress bar,
computed **monthly contribution rate** χρειαζεται για να πιασεις το deadline, manual contributions,
πολλαπλα goals παραλληλα.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα εγγραφη «Can it help me save toward a goal?» αμεσως πριν το «How do backups work?» (κλεινει το
  money/reports cluster, ιδιο σημειο που μπηκαν τα insurance-export/tax FAQ προηγουμενα increments).
- Ρεει αυτοματα στο FAQPage JSON-LD + anchor id `faq-can-it-help-me-save-toward-a-goal`.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes)· `/` route 5.33 kB, αμεταβλητο (copy-only).
- Prerender (`.next/server/app/index.html`): «Can it help me save toward a goal?» -> 5 hits, anchor id
  -> 5 hits (HTML + JSON-LD + RSC payload, consistent).
- Browser preview (in-app Browser): port 3100 κατειλημμενο απο Docker (`com.docke` listening, οπως και σε
  προηγουμενο run)· χρησιμοποιηθηκε port 3103. `get_page_text` επιβεβαιωσε ολοκληρο το FAQ section με το
  νεο item στη σωστη σειρα (μετα «tax filing», πριν «backups»)· `read_console_messages` onlyErrors καθαρο.
  Server σταματησε μετα (`pkill`), `lsof` επιβεβαιωσε μηδεν listener στο 3103.
- em-dash: 0 σε ολο το page.tsx (commas μονο). Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx`· staged+
  committed ΜΟΝΟ το δικο μου landing path.
- Commit `f8f0e92`.

Επομενο increment: (e) polish συνεχεια, IMAP email-in (P11) δικο του FAQ αν χρειαστει (self-hosted-only
technicality, ισως δεν αξιζει ξεχωριστο απο το roadmap bullet)· annual Offers στα per-tier Pricing aria
labels· real app screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο shipped module αν εμφανιστει gap
(τσεκαρε `git log --oneline -25` του κυριου repo στην αρχη καθε run, οχι μονο features.md/saas.md).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 (cont.⁵) — (e) polish/content: Vouchers card += loyalty & membership cards

Increment (e). Πριν το ξεκινημα διαβασα `git log --oneline -8` του κυριου repo (νεοτερα απο το προηγουμενο
`e1e00d8` log entry). Νεα commits: `7c90186 feat(saas)` MFA enrollment core (Account fields + start/confirm/
disable routes) και `fa6b7f2 feat(mobile)` budget envelope/rollover mobile parity. Ελεγξα και τα δυο: το MFA
commit message ειναι ρητο **«Not yet wired into login, that is the deliberately separate, riskier increment
80c»** -> οχι user-facing ακομα, ιδιο συμπερασμα με το προηγουμενο TOTP/MFA scaffold (bb49b36) -> skip. Το
budget rollover ειναι mobile-parity fix για feature που ηδη καλυπτεται πληρως στο landing (`grep budget` ->
Expenses card desc ηδη λεει «Budgets per category, with optional envelope rollover so an unspent month
carries forward») -> ηδη καλυμμενο, skip.

Ακολουθησα το gap που ειχε ηδη επισημανθει στο προηγουμενο log entry: loyalty/membership cards. Επιβεβαιωσα
στο `docs/features.md` («Loyalty & membership cards» section, μετα το Gift cards) -> πληρες, τεκμηριωμενο,
user-facing feature: barcode-format αυτο-ανιχνευση απο το shape του καρτ-αριθμου (EAN13/UPC/CODE128), tap
για full-screen scannable barcode στο checkout, black-on-white render για αξιοπιστο scan. `grep -n loyalty
page.tsx` πριν το increment = μηδεν hits. Το Vouchers card καλυπτε ΜΟΝΟ τα μονεταρια gift cards/discount
codes, τιποτα για membership/loyalty.

Αλλαγη (app/page.tsx, ΕΝΑ string μονο, μηδεν UI/CSS/dependency/bundle change): στο `FEATURES` array, το
«Vouchers & coupons» card desc προσθεσε προταση «Loyalty and membership cards work too, tap one to show a
scannable barcode at checkout.» αναμεσα στο gift-card sentence και το AI-scan sentence (ιδιο patteren με
προηγουμενα increments που διπλωσαν μικρα gaps μεσα σε υπαρχουσα card copy αντι για νεο section, π.χ. το
budget-rollover μεσα στο Expenses desc).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes)· `/` route 5.33 kB, αμεταβλητο (copy-only, ιδιο μεγεθος
  με πριν).
- Browser preview (in-app Browser): port 3100 κατειλημμενο απο Docker (`com.docke` listening, οπως παντα),
  χρησιμοποιηθηκε port 3105 (`next start` production build, οχι dev). `get_page_text` επιβεβαιωσε ολοκληρο
  το Features section με το νεο sentence στη σωστη θεση μεσα στο Vouchers card, σωστη σειρα προτασεων.
  `read_console_messages` onlyErrors -> «No console logs.» (καθαρο). Server σταματησε μετα (`pkill`), `lsof`
  επιβεβαιωσε 3105 clear.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file (κανενα concurrent routine
  mid-commit). Staged+committed ΜΟΝΟ το δικο μου path.
- Commit `8042740`, pushed καθαρα (`41138d9..8042740 main -> main`), κανενα rebase χρειαστηκε.

Επομενο increment: (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο
shipped module αν εμφανιστει gap (τσεκαρε `git log --oneline -10` του κυριου repo στην αρχη καθε run, οχι
μονο features.md/saas.md). Αν το increment 80c (MFA wiring στο login flow) γινει σε επομενο κυριο-repo run
και μπει σε χρηση, αξιζει δικο του FAQ item (money/data/security cluster, μετα το «Is my financial data
secure?»).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

Increment (e). Πριν το ξεκινημα διαβασα `git log --oneline -15` του κυριου repo· τα νεοτερα commits ηταν
`82cc718 feat(saas)` TOTP+recovery-code core για MFA και `0554035 feat(mobile)` safe-to-spend forward
cashflow card. Ελεγξα και τα δυο: το TOTP/MFA ειναι **ρητα "scaffold" only** (commit message: «Nothing is
wired into Account, any route, or the login flow yet»· `grep -i totp/mfa docs/saas.md` = μηδεν hits) αρα
οχι user-facing, δεν ειναι landing gap ακομα. Το safe-to-spend ειναι ηδη καλυμμενο στο Reports feature card
(«plus a forward safe-to-spend view that projects what is left after upcoming bills»). Κανενα απο τα δυο
δεν ηταν gap.

Ακολουθησα το προτεινομενο απο το προηγουμενο log entry: εξετασα το IMAP email-in FAQ candidate αλλα το
πρωτο `grep -rli imap apps/web/src` + το SettingsClient.tsx `ImapImportManager` δειχνουν το IMAP panel
**παντα ορατο** στο Settings, χωρις κανενα SAAS_MODE/tenant gate γυρω του· το «Self-hosted only» στο
`docs/features.md:120` φαινεται να σημαινει «no background cron» (χρειαζεται χειροκινητο "Check inbox now"
και στις δυο εκδοσεις) οχι «hosted δεν το εχει καθολου». Ρισκο ανακριβειας αν προσθετα Compare row/FAQ που
να ισχυριζεται αποκλειστικοτητα self-host, οποτε το παρελειψα (οπως ειχε ηδη προειδοποιησει το προηγουμενο
log entry: «ισως δεν αξιζει»). Το annual-Offers-aria-labels item αποδειχθηκε **ηδη done**: διαβασα ολοκληρο
το `Pricing.tsx` component, εχει ηδη πληρες monthly/annual toggle (`role="group" aria-label="Billing
period"`, `aria-pressed` ανα κουμπι) + `role="status" aria-live="polite"` sr-only ανακοινωση οταν αλλαζει η
τιμη· η JSON-LD Offers εχουν ηδη annual `UnitPriceSpecification`. Τιποτα να προσθεσω εκει.

Αντ' αυτου βρηκα **πραγματικο, τεκμηριωμενο, εντελως ακαλυπτο gap**: `docs/features.md:453-475`
(Notifications) περιγραφει δυο συστηματα, alert summaries (deals/installments/budgets/warranties/bills/
price-hikes/gift-cards -> ntfy/Discord/Slack/Telegram/generic webhook) ΚΑΙ **event webhooks για automation**
(P24: Home Assistant/n8n/Node-RED/Zapier, signed HMAC JSON POST σε `receipt.parsed`/`budget.exceeded`/
`installment.due`/`price.drop`). `grep -ni "webhook\|discord\|slack\|telegram" page.tsx` πριν το increment
= μηδεν hits (μονο «ntfy push» σε ενα stack chip, χωρις λεπτομερεια). Ισχυρο, διαφοροποιητικο power-user
feature (ταιριαζει ακριβως με το target audience «Homelabbers» persona που ηδη υπαρχει στο page) που δεν
ειχε καμια αναφορα.

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change):
- Νεα εγγραφη «Can it notify me or plug into home automation?» αμεσως μετα το «Can it help me save toward
  a goal?» και πριν το «How do backups work?» (κλεινει το money/reports cluster, ανοιγει το infra cluster).
  Απαντηση: alert-summary καναλια (ntfy/Discord/Slack/Telegram/generic webhook) + automation event webhooks
  με HMAC signature + τα 4 event types + 3 πλατφορμες παραδειγμα (Home Assistant/n8n/Node-RED/Zapier).
- Ρεει αυτοματα στο FAQPage JSON-LD + anchor id `faq-can-it-notify-me-or-plug-into-home-automation`.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success, ολα static (11 routes, αμεταβλητο)· `/` route 5.33 kB, αμεταβλητο (copy-only).
- Prerender (`.next/server/app/index.html`): «Can it notify me or plug into home automation?» -> 5 hits,
  anchor id `faq-can-it-notify-me-or-plug-into-home-automation` -> 5 hits (HTML + JSON-LD + RSC payload).
- Browser preview (in-app Browser): port 3100 κατειλημμενο απο Docker (`com.docke` listening), χρησιμο-
  ποιηθηκε port 3104. `get_page_text` επιβεβαιωσε ολοκληρο το FAQ section με το νεο item στη σωστη θεση
  (μετα savings goals, πριν backups)· `read_console_messages` onlyErrors καθαρο. Server σταματησε μετα
  (`pkill`), `lsof` επιβεβαιωσε μηδεν listener στο 3104.
- em-dash: 0 σε ολο το page.tsx (commas μονο, το νεο item χρησιμοποιει comma-lists για τα event types).
  Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.

Επομενο increment: (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο
shipped module αν εμφανιστει gap (τσεκαρε `git log --oneline -20` του κυριου repo στην αρχη καθε run).
Loyalty/membership cards (`docs/features.md:330`) ειναι ισως ξεχωριστο απο vouchers/coupons, θα μπορουσε
να αξιζει δικια του γραμμη στο Features καρτα «Vouchers & coupons» αν φανει gap σε επομενο run.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 (cont.⁷) — (e) polish/content: Subscriptions card += auto-discover untracked charges (P7)

Increment (e). Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει, δεν εγινε
pause), ελεγχος `~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα δυο bakecore-finance, τιποτα για
landing/pharos), και `git log --oneline -15` του κυριου repo. Νεοτερα commits απο το προηγουμενο log entry:
`31cc37c feat(mobile)` subscription auto-discover suggestions (P7 mobile parity), `7c90186`+`df676f8
feat/fix(saas)` MFA enrollment core + password re-auth fix, `2a904ab`+`5b3c81c` (tests μονο). Ελεγξα το MFA:
ιδιο συμπερασμα με προηγουμενα runs, ρητα "Not yet wired into login" στο commit message -> οχι user-facing
ακομα, skip.

Το `31cc37c` (mobile parity) εδειξε οτι το P7 auto-discover ειναι πλεον feature και στις δυο πλατφορμες
(web ηδη shipped, docs/features.md:252-258, mobile μολις ηρθε). Επιβεβαιωσα: `grep -n auto-discover
page.tsx` πριν το increment = μηδεν hits. Το feature: heuristic scan (deterministic, οχι AI) στο Expenses
history για 3+ χρεωσεις απο τον ιδιο vendor σε ~μηνιαια διαστηματα (±5 μερες) χωρις αντιστοιχη υπαρχουσα
Subscription -> εμφανιζεται σαν "possible untracked subscription" candidate, one-click Track το μετατρεπει.
Πραγματικο, τεκμηριωμενο, ακαλυπτο gap στο Subscriptions card (το οποιο μιλουσε μονο για renewal calendar
+ trial reminders, τιποτα για ανιχνευση).

Αλλαγη (app/page.tsx, FEATURES array, μια προταση μονο στο Subscriptions card desc, μηδεν UI/CSS/dependency/
bundle change): «It also scans your expense history for regular charges you never tracked and lets you add
them as a subscription in one click.» (ιδιο patteren με τα προηγουμενα increments που διπλωσαν μικρα gaps
μεσα σε υπαρχουσα card copy, π.χ. loyalty cards -> Vouchers, budget rollover -> Expenses).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (foreground timeout στα 120s, ολοκληρωθηκε background σε background bash·
  process wait αντι για arbitrary sleep), ολα static (11 routes, αμεταβλητο)· `/` route 5.33 kB, αμεταβλητο
  (copy-only, ιδιο μεγεθος με πριν).
- Browser preview (in-app Browser): port 3100 κατειλημμενο απο Docker (`com.docke` listening, οπως παντα).
  Χρησιμοποιηθηκε port 3106, `next start` πανω στο production build (οχι dev server). `get_page_text`
  επιβεβαιωσε πληρες Subscriptions card με τη νεα προταση στη σωστη θεση (μετα το trial-reminder sentence).
  `read_console_messages` onlyErrors -> «No console logs.» (καθαρο). Server σταματησε μετα (`pkill`), `lsof`
  επιβεβαιωσε 3106 clear.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged+committed ΜΟΝΟ τα
  δικα μου landing paths (page.tsx + αυτο το log entry).

Επομενο increment: (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked)· loyalty/
membership cards ηδη καλυφθηκε (cont.⁵)· ή νεοτερο shipped module αν εμφανιστει gap (τσεκαρε
`git log --oneline -15..20` του κυριου repo στην αρχη καθε run, οχι μονο docs/features.md/saas.md). Αν το
MFA login-wiring (αναφερομενο σαν "increment 80c" σε προηγουμενα commit messages) γινει live σε επομενο
κυριο-repo run, αξιζει δικο του FAQ item (money/data/security cluster, μετα το «Is my financial data
secure?»).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-20 (cont.⁸) — (e) polish/content: Reports card += Month in Review narrative digest

Increment (e). Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα δυο bakecore-finance, τιποτα για landing/pharos), και
`git log --oneline -40` του κυριου repo (feature/content commits μονο, φιλτραρισμενο). Νεοτερα απο το
προηγουμενο log entry: `2965e57 feat(saas)` MFA enrollment UI panel (increment 82) και `af8bc68 feat(mobile)`
Bills payable/due tracker (P28 mobile parity).

Ελεγξα και τα δυο: το MFA (`docs/saas.md:262-293`) ειναι ρητα **ακομα οχι-wired στο login**
(«increment 80c, separate» ρητα αναφερεται σαν μελλοντικο, `POST /api/saas/auth/login` δεν το απαιτει ακομα)
-> ιδιο συμπερασμα με προηγουμενα runs, skip, οχι user-facing complete feature ακομα. Το Bills tracker
αποδειχθηκε **ηδη πληρως καλυμμενο**: `docs/features.md:266-291` + FAQ `docs/features.md:476-477»
(«Does it track bills I pay by hand, like utilities?») ηδη υπαρχουν στο `page.tsx` (βρεθηκαν και τα δυο με
grep), το mobile commit ειναι απλως parity για κατι που το web ηδη διαφημιζει. Κανενα απο τα δυο δεν ηταν
gap.

Επεκτεινα την αναζητηση πισω (`git log --oneline -40` φιλτραρισμενο σε feat/content commits, οχι μονο τα 2
τελευταια) για να πιασω οτιδηποτε ξεφυγε απο προηγουμενα runs: budget envelope/rollover (P25 mobile parity),
safe-to-spend forward cashflow (P19 mobile parity), tax-deductible tagging (P8), insurance export (P13),
BYO AI key (increment 75), GDPR erasure (increment 76) -> ολα ηδη καλυμμενα στο page.tsx (grep confirmed:
"rollover", "safe-to-spend", "tax-deductible", "insurance export", "Bring your own AI/key", "delete my
account"). Ενα πραγματικο ακαλυπτο ευρημα: **Month in Review** (`docs/features.md:369-375`) -- ενα
deterministic (zero-AI) narrative digest στην κορυφη του Reports page που συνοψιζει τον τρεχοντα μηνα σε μια
προταση (total spent/income/net position + % change, top category, over-budget categories, recurring-charge
αλλαγες, warranties ληγουν σε 90d). `grep -ni "month in review" page.tsx` πριν το increment = μηδεν hits.
Δυνατο, διαφοροποιητικο σημειο (zero-AI, δειχνει οτι το app κανει πραγματικη αναλυση οχι μονο data entry)
που ταιριαζει ακριβως με το ηδη-υπαρχον persona targeting («deterministic», «zero-cost» οπως και το
safe-to-spend βρισκεται ηδη στην ιδια καρτα).

Αλλαγη (app/page.tsx, FEATURES array, Reports card desc, μια προταση μονο, μηδεν UI/CSS/dependency/bundle
change): προσθεσα «A zero-AI Month in Review digest opens the page with a one-sentence summary of what
changed.» αναμεσα στο safe-to-spend sentence και το closing «See where the money actually goes.» (ιδιο
patteren με ολα τα προηγουμενα increments που διπλωσαν μικρα gaps μεσα σε υπαρχουσα card copy).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (το build αργησε πολυ, ~25 λεπτα wall-clock, λογω πολυ υψηλου system load
  average [67-80] απο ~14 ταυτοχρονες Claude routine διεργασιες στο μηχανημα· περιμενα με Monitor αντι για
  arbitrary sleep, το process ολοκληρωθηκε καθαρα exit 0, οχι hang). Ολα static (13 routes)· `/` route
  5.33 kB, αμεταβλητο (copy-only, ιδιο μεγεθος με πριν).
- Browser preview (in-app Browser): port 3100 κατειλημμενο απο Docker (`com.docke` listening, οπως παντα),
  χρησιμοποιηθηκε port 3107 (`next start` πανω στο production build, οχι dev). `get_page_text` επιβεβαιωσε
  ολοκληρο το Reports card με τη νεα προταση στη σωστη θεση (μετα το safe-to-spend sentence, πριν το closing
  sentence)· `read_console_messages` onlyErrors -> «No console logs.» (καθαρο). Server σταματησε μετα
  (`pkill`), `lsof` επιβεβαιωσε 3107 clear.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file (κανενα concurrent routine
  mid-commit). Staged+committed ΜΟΝΟ τα δικα μου landing paths.

Επομενο increment: (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked)· ή νεοτερο
shipped module αν εμφανιστει gap (τσεκαρε `git log --oneline -20..40` του κυριου repo στην αρχη καθε run,
φιλτραρισμενο σε feat/content commits· η ευρυτερη αναζητηση αυτου του run [-40 αντι -15] επιβεβαιωσε οτι
δεν υπαρχουν αλλα ξεχασμενα gaps προς το παρον). Αν το MFA login-wiring («increment 80c») γινει live σε
επομενο κυριο-repo run, αξιζει δικο του FAQ item (money/data/security cluster, μετα το «Is my financial data
secure?»).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-21 (cont.) — (e) polish/content: FEATURES += Tasks & planning card

Increment (e). Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα δυο bakecore-finance, τιποτα για landing/pharos), και
`git log --oneline -60` του κυριου repo φιλτραρισμενο σε feat/content commits. Νεοτερο απο το προηγουμενο
log entry: `96e5cbb feat(saas)` MFA login-flow wiring (increment 83, TODO §9), + mobile item-document-vault
(P21 parity) + landing FAQ commit (το ιδιο μου το προηγουμενο run).

Ελεγξα το MFA (`docs/saas.md`): το `96e5cbb` λεει ρητα «login-flow wiring» στο commit title, αρα ισως πλεον
ειναι πραγματικα wired (σε αντιθεση με τα προηγουμενα runs που το εβρισκαν "not yet wired"). Δεν το αγγιξα
ομως αυτο το run (ηδη διαλεξα αλλο gap πριν το ψαξω σε βαθος)· σημειωνεται σαν πρωτος candidate για επομενο
run αν επιβεβαιωθει live-wired (βλ. Επομενο increment).

Το προηγουμενο log entry (2026-07-21) ειχε ηδη εντοπισει το **Tasks / Kanban planner module** σαν το
επομενο ακαλυπτο κενο (μηδεν αναφορα πουθενα στο page.tsx). Επιβεβαιωσα ξανα πριν το increment
(`grep -in "task\|kanban" page.tsx` = μηδεν hits εκτος cosmetic "browser tab" nowhere). Το module ειναι
πληρως shipped (`docs/features.md:435-440`): planner (`/tasks`) με Kanban board (Todo/In-Progress/Blocked/
Done) + list view, quick-add με `#tag` parsing, drag-and-drop η arrow-key moves μεταξυ columns, per-project
progress bar οταν φιλτραρεις ανα tag, convert items απο Inventory/Shopping σε tasks. Αρκετα σημαντικο modulo
(οχι minor feature) ωστε να παρει δικια του card στο FEATURES grid, οχι απλα μια προταση μεσα σε αλλη καρτα.

Αλλαγες:
- `apps/landing/app/components/Icon.tsx`: νεο icon `kanban` (τρεις καθετες γραμμες διαφορετικου υψους,
  ιδιο glyph με το πραγματικο lucide "kanban" icon, συνεπες με τα υπολοιπα stroke-only icons του αρχειου).
- `apps/landing/app/page.tsx` (FEATURES array μονο, μηδεν CSS/layout change): νεα καρτα «Tasks & planning»
  αναμεσα στο Reports και στο Network (ιδια σειρα με το docs/features.md, οπου το Tasks section ερχεται
  ακριβως πριν το Network section)· color `var(--purple)` (ισοζυγιο χρωματων: accent/cyan/gold ηταν ηδη 2x
  το καθενα, purple/red 1x το καθενα πριν το increment). Το `.feature-grid` ειναι responsive CSS grid
  (repeat(4,1fr) -> 2 -> 1 σε μικροτερα viewports, οχι fixed-count layout σαν το SHOWCASE_MODS dashboard
  mock)· 9 καρτες αντι 8 απλα αφηνει την τελευταια σειρα με 1 καρτα, αποδεκτο visual trade-off, δεν το
  αγγιξα το SHOWCASE_MODS mock (αυτο ειναι fixed 8-tile mock του πραγματικου homepage grid, θα χρειαζοταν
  CSS change εκτος του πεδιου αυτου του content-only increment).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο πληθος)· `/` route 5.35 kB (απο 5.33 kB, αναμενομενο
  λογω νεου κειμενου καρτας).
- Browser preview: `next start -p 3109` (3000/3100 κατειλημμενα απο Docker, οπως παντα). `get_page_text` +
  `read_page` (accessibility tree) επιβεβαιωσαν πληρες περιεχομενο: το `article` «Tasks & planning» εμφανιζεται
  στη σωστη θεση (μετα Reports, πριν Network) με το πληρες κειμενο της περιγραφης· `read_console_messages`
  onlyErrors -> «No console logs.» (καθαρο). Η ιδια in-app Browser pane εμφανισε ενα rendering glitch αυτο
  το run (screenshot επεστρεφε μαυρη/κενη εικονα σε 2 διαφορετικα tabs μετα απο scroll/navigate ενεργειες,
  ενω το `get_page_text`/`read_page`/`read_console_messages` δουλευαν κανονικα και σε νεο tab η πρωτη
  screenshot ΠΡΙΝ οποιαδηποτε scroll ενεργεια εδειξε το hero σωστα) -> tool-side pane issue, οχι προβλημα
  του page/code (η task file επιτρεπει best-effort όταν τα browser tools δεν συνεργαζονται καθαρα, εδω
  χρησιμοποιηθηκε το text-based fallback που ηδη επιβεβαιωσε πληρως το αλλαγμενο περιεχομενο). Server
  σταματησε μετα (`pkill -f "next start -p 3109"`), `lsof` επιβεβαιωσε 3109 clear.
- em-dash: 0 και στα δυο αλλαγμενα αρχεια (`page.tsx`, `Icon.tsx`). Δεν αγγιξα Docker/:3000/web/mobile,
  μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ τα δυο δικα μου αρχεια modified
  (`apps/landing/app/components/Icon.tsx`, `apps/landing/app/page.tsx`)· `git diff --cached --name-only`
  κενο πριν το stage -> κανενα ξενο staged file (κανενα concurrent routine mid-commit). Staged+committed
  ΜΟΝΟ τα δικα μου landing paths.

Επομενο increment: επιβεβαιωσε αν το `96e5cbb feat(saas) MFA login-flow wiring` σημαινει οτι το MFA ειναι
πλεον πραγματικα wired στο login (`POST /api/saas/auth/login` requires it) -> αν ναι, νεο δικο του FAQ item
(money/data/security cluster, μετα το «Is my financial data secure?»)· αν οχι ακομα (ιδιο "not yet wired"
pattern με ολα τα προηγουμενα runs), skip ξανα. Αλλιως (e) polish συνεχεια, real app screenshots οταν
υπαρξουν assets (blocked), ή νεοτερο shipped module αν εμφανιστει gap.

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-21 — (e) polish/content: FAQ += AI command bar (natural-language assistant)

Increment (e). Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα δυο bakecore-finance, τιποτα για landing/pharos), και
`git log --oneline -25` του κυριου repo. Νεοτερο απο το προηγουμενο log entry: `215e692 docs(saas)` MFA
enrollment UI documentation (increment 82), + δυο test/docs commits (setup wizard test coverage). Ελεγξα το
MFA (`docs/saas.md:273-277`): ρητα ΑΚΟΜΑ **"not yet wired"** στο login (`POST /api/saas/auth/login` δεν το
απαιτει, increment 80c ξεχωριστο) -> ιδιο συμπερασμα με ολα τα προηγουμενα runs, οχι user-facing complete
feature ακομα, skip.

Δεδομενου οτι δεν υπηρχε νεο shipped module στο main repo, εκανα συστηματικο sweep: συγκρινα καθε κεφαλαιο
του `docs/features.md` (grep-άροντας τον τιτλο του καθε module στο `page.tsx`) για να βρω ξεχασμενα κενα
πεσω απο τα ηδη-καλυμμενα (Inventory/Receipts/Expenses/Statements/Subscriptions/Vouchers/Reports/Network/
Bills/Splitting/Spaces/Tax/Insurance/Goals/Notifications/Trash, ολα ηδη βρεθηκαν). Δυο modules βγηκαν
**τελειως ακαλυπτα**: **Tasks** (Kanban planner, `docs/features.md:416-421`) και **AI command bar**
(conversational agent στο navbar, `docs/features.md:433-446`). Το AI command bar ειναι το πιο δυνατο απο τα
δυο, ενα πραγματικο διαφοροποιητικο σημειο (natural-language agent που εκτελει actions, οχι απλα chat) και
ειχε **μηδεν** δικια του αναφορα σε ολο το page.tsx (`grep -in "AI command\|command bar" page.tsx` = μηδεν
hits πριν το increment)· η μονη σχετικη αναφορα ηταν ενα φευγαλεο «AI assistant» μεσα στο mobile FAQ, χωρις
καμια εξηγηση τι κανει. Διαλεξα αυτο για το increment (ενα increment/run)· το Tasks planner μενει σαν
candidate για επομενο run (βλ. Επομενο increment).

Αλλαγη (app/page.tsx, FAQS array μονο, μηδεν UI/CSS/dependency/bundle change): νεα εγγραφη «Can I talk to it
in plain English instead of clicking through menus?» αμεσως μετα το «Do I need an AI API key?» και πριν το
«What do I need to run it?» (φυσικη συνεχεια: αφου εξηγειται οτι το AI ειναι optional/BYO-key, εξηγειται τι
κανει πραγματικα η assistant). Απαντηση: navbar command bar (διπλασιαζει ρολο και ως global search) ->
φυσικη γλωσσα εντολες ("add a YouTube subscription", "log expense OTE 84 euros") -> tool-using agent που
προσθετει/ενημερωνει/διαγραφει expenses/income/subscriptions/tasks/items, log price, η απανταει σε ερωτησεις
overview· ρωταει follow-up σε ασαφη αιτηματα· AI history κρατα το ιστορικο· απαιτει Anthropic-capable
provider.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (background process, ~94s compile λογω υψηλου system load απο τις υπολοιπες
  routines· περιμενα το task-notification αντι για arbitrary sleep, exit 0 καθαρο). Ολα static (11 routes,
  αμεταβλητο)· `/` route 5.33 kB, αμεταβλητο (copy-only, ιδιο μεγεθος με πριν).
- Browser preview: το `mcp__Claude_Browser__*` toolset **δεν ηταν διαθεσιμο αυτο το run** (hook timeout,
  "host client may be unreachable", 2 retries και τα δυο απετυχαν) -> best-effort fallback σε curl-based
  text verification (η task file επιτρεπει ρητα best-effort skip οταν τα browser tools λειπουν). `next start
  -p 3108` πανω στο production build (3100/3000 κατειλημμενα απο Docker, οπως παντα)· `curl` επιβεβαιωσε: η
  νεα ερωτηση εμφανιζεται 2× (SSR html + RSC payload), το deterministic anchor id
  `faq-can-i-talk-to-it-in-plain-english-instead-of-clicking-through-menus` υπαρχει (FAQPage JSON-LD + DOM),
  και η σειρα ειναι σωστη (Do I need an AI API key? -> νεο item -> What do I need to run it?, σε ολα τα 4×
  occurrences του HTML). Server σταματησε μετα (`pkill -f "next start -p 3108"`), `lsof` επιβεβαιωσε 3108
  clear.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified (τα
  αλλα modified αρχεια απο το αρχικο snapshot της συνεδριας, apps/mobile/apps/web, ειχαν ηδη committed απο
  αλλες routines μεχρι να ξεκινησει αυτο το run, εκτος του territory μου ουτως ή αλλως), `git diff --cached
  --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged+committed ΜΟΝΟ τα δικα μου landing
  paths.

Επομενο increment: **Tasks / Kanban planner** ειναι το επομενο κατι candidate, μηδεν αναφορα πουθενα στο
page.tsx (`grep -in task page.tsx` = μηδεν hits πριν αυτο το run)· θα μπορουσε να παρει δικια του γραμμη σε
υπαρχουσα καρτα ή νεα FAQ, εξαρταται τι χωρος υπαρχει στο επομενο run. Αλλιως (e) polish συνεχεια, real app
screenshots οταν υπαρξουν assets (blocked). Αν το MFA login-wiring («increment 80c») γινει live, αξιζει δικο
του FAQ item (money/data/security cluster, μετα το «Is my financial data secure?»).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 — (e) polish/content: FAQ += Calendar / iCal feed

Increment (e). Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα δυο bakecore-finance, τιποτα για landing/pharos).

Σημειωση για το ιδιο το log αρχειο: το τελευταιο entry πριν απο αυτο (2026-07-21, "FAQ += AI command bar")
ειχε μεινει στην κυριολεκτικη ουρα του αρχειου με "Επομενο increment: Tasks/Kanban planner", αλλα το git log
του κυριου repo (`git log --format='%h %ad %s' -- apps/landing`) δειχνει οτι ενα ΠΙΟ προσφατο commit
(`2240ac9`, 2026-07-23 23:03, "FEATURES += Tasks & planning card") ειχε ηδη γινει ΜΕΤΑ το AI-command-bar
commit, με το αντιστοιχο log entry του γραμμενο ΠΡΙΝ στο αρχειο (οχι στην κυριολεκτικη ουρα). Επιβεβαιωσα
με `grep -in "kanban\|task" page.tsx` οτι το Tasks/Kanban card ΚΑΙ το AI-command-bar FAQ ειναι και τα δυο
ηδη live στον κωδικα (γραμμες 83-86 και 450-451 αντιστοιχα) -> καμια εκκρεμοτητα εκει, το "next increment"
pointer του τελευταιου entry ηταν ηδη ικανοποιημενο απο ενα προηγουμενο run, απλα το log ordering ειναι
ελαφρως εκτος χρονολογικης σειρας (πιθανον απο δυο runs πολυ κοντα χρονικα). Δεν διορθωσα το log ordering
(out of scope, δεν αλλαζει το περιεχομενο, μονο η σειρα εγγραφων).

Δεδομενου οτι δεν υπηρχε νεο pointer, εκανα συστηματικο sweep συγκρινοντας τους τιτλους του `docs/features.md`
(`grep -n "^## \|^### "`) με τα FEATURES/FAQS titles στο `page.tsx`. Το **Calendar** module
(`docs/features.md:363-381`) βγηκε **τελειως ακαλυπτο**: μηδεν αναφορα στο page.tsx (η μονη λεξη "calendar"
που υπηρχε ηταν το icon name για το Subscriptions card, ασχετο). Το module ειναι πληρως shipped: three-month
agenda (`/calendar`) που ενωνει subscription renewals + installments aggregated per month + projected
recurring bills/income + warranty/voucher expiries, με money-in/money-out totals ανα μηνα· ΚΑΙ ενα read-only
**iCal (.ics) feed** subscribable απο Google/Apple/Outlook Calendar, authed με ξεχωριστο low-scope calendar
token (οχι το full API bearer, ωστε ενα leaked subscribe URL να μην δινει API access), generate/copy/
rotate/revoke απο Settings -> AI. Πραγματικο διαφοροποιητικο σημειο (λιγα personal-finance apps προσφερουν
subscribe-able calendar feed) και θεματικα φυσικη προεκταση της ηδη-υπαρχουσας ερωτησης για bills.

Αλλαγη (`apps/landing/app/page.tsx`, FAQS array μονο, μηδεν UI/CSS/dependency/bundle-size change πλην του
νεου κειμενου): νεα εγγραφη «Can I see all my renewals, installments, and bills in one calendar?» αμεσως
μετα το «Does it track bills I pay by hand, like utilities?» και πριν το «Can I split spending across more
than one home or property?» (θεματικη γειτονια: ολα «τι εχει due date/repeats»). Απαντηση: three-month
agenda unifying renewals/installments/bills/expiries + money-in/out per month + iCal feed subscription
(Google/Apple/Outlook) με το δικο του low-scope token, generate/rotate στο Settings -> AI.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (απο 5.33 kB, αναμενομενο
  λογω νεου κειμενου FAQ).
- Browser preview: `next start -p 3110` πανω στο production build (3000/3100 κατειλημμενα απο Docker, οπως
  παντα). `mcp__Claude_Browser__*` ηταν διαθεσιμο αυτο το run. `preview_start` + `read_console_messages`
  (onlyErrors) -> «No console logs.» καθαρο. `get_page_text` (20000 chars) επιβεβαιωσε: η νεα ερωτηση
  εμφανιζεται στη σωστη σειρα στη FAQ λιστα (μετα «Does it track bills...», πριν «Can I split spending...»),
  ολες οι υπολοιπες sections (hero/features/pricing/roadmap/footer) renders σωστα, μηδεν regression.
  `javascript_tool` επιβεβαιωσε: το πληρες answer text υπαρχει στο DOM (`outerHTML.includes(...)` -> true,
  σωστο αφου το FAQ accordion κρυβει το answer οπτικα αλλα το κραταει στο DOM), και το deterministic anchor
  id `faq-can-i-see-all-my-renewals-installments-and-bills-in-one-calendar` υπαρχει
  (`getElementById(...)` -> true). Screenshot του hero επιβεβαιωσε clean render. Server σταματησε μετα
  (`pkill -f "next start -p 3110"`), `ps aux` επιβεβαιωσε καμια next-server process (το `lsof -i :3110`
  εδειξε αρχικα false-positive matches, ασχετες Claude-app "sim-control" TCP συνδεσεις που τυχαινει να
  εχουν το ιδιο service-name mapping στο macOS `/etc/services`, οχι το node process μου· `ps aux | grep
  "next start"` επιβεβαιωσε κενο).
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file (κανενα concurrent routine
  mid-commit). Staged+committed ΜΟΝΟ το δικο μου landing path.

Επομενο increment: sweep του `docs/features.md` δεν βρηκε αλλα τελειως ακαλυπτα modules μετα το Calendar
(Search, Settings, Trash καλυπτονται εμμεσα μεσα σε αλλα items/stack list). Επομενο candidate: `docs/saas.md`
sweep για hosted-only functionality που ισως αξιζει δικια της αναφορα (π.χ. MFA login-wiring αν επιβεβαιωθει
live σε επομενο run· `96e5cbb`/`3206fa3` κλπ commits του κυριου repo αφορουν rate-limiting, εσωτερικο
security hardening οχι user-facing feature, δεν χρειαζεται δικια του FAQ γραμμη). Αλλιως (e) polish
συνεχεια, real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (2) — FAQ += Two-factor authentication (hosted MFA)

Increment (e), συνεχεια του docs/saas.md sweep απο το προηγουμενο entry σημερα. Πριν το ξεκινημα:
coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος `~/.claude/ASK_ACHILLEAS.md` (δυο OPEN
entries, και τα δυο bakecore-finance, τιποτα για landing/pharos).

Το προηγουμενο entry σημερα ειχε σαν επομενο candidate ενα sweep του `docs/saas.md` για hosted-only
functionality χωρις δικια της FAQ γραμμη, με ρητη αναφορα στο MFA login-wiring "αν επιβεβαιωθει live".
Διαβασα `docs/saas.md` (## Multi-factor authentication, γραμμες 274-373) και βρηκα οτι η ιδια η τεκμηριωση
ΑΚΟΜΑ λεει "Login integration is not yet wired (increment 80c, separate)" δηλ. σταλε doc note. Ελεγξα το
πραγματικο git log του κυριου repo (`git log --oneline --all | grep -i mfa`) και βρηκα commit `96e5cbb`
"feat(saas): MFA login-flow wiring (increment 83, TODO §9)", ημερομηνια 2026-07-21 (πριν σημερα), που
καλωδιωνει πλημως το `POST /api/saas/auth/login` -> pending-MFA cookie -> `POST/DELETE
/api/saas/auth/mfa` (TOTP η recovery-code verify) -> real session. Επιβεβαιωσα διαβαζοντας το πραγματικο
route `apps/web/src/app/api/saas/auth/mfa/route.ts` (υπαρχει, module-level doc-comment περιγραφει ακριβως
το two-step login flow). Δηλαδη το MFA ειναι **πληρως live** (enrollment απο 80a/82 + login-gating απο 83),
οχι απλα enrollment-only οπως υπαινισσεται το stale doc note· ασφαλες θεμα για δικια του FAQ γραμμη τωρα.

Αλλαγη (`apps/landing/app/page.tsx`, FAQS array μονο, μηδεν UI/CSS/dependency/bundle-size change πλην του
νεου κειμενου): νεα εγγραφη «Does it support two-factor authentication?» αμεσως μετα το «Is my financial
data secure?» και πριν το «Can I permanently delete my account and all its data?» (θεματικη γειτονια, ολα
security/account cluster). Απαντηση: TOTP-based 2FA στο hosted (οποιοδηποτε authenticator app, QR/6-ψηφιο
confirm, one-time recovery codes), obligatory σε καθε login μολις ενεργοποιηθει, ρητα σημειωνω οτι το
self-hosted εχει ενα shared login πισω απο LAN/VPN αντι για per-person accounts αρα αυτο το layer ειναι
hosted-only (ακριβες, βασισμενο στο `docs/self-hosting.md` AUTH_SECRET single-session μοντελο).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο μεγεθος με το
  προηγουμενο increment, μικρη διαφορα κειμενου δεν αλλαξε το rounded kB).
- Browser preview: `next start -p 3120` πανω στο production build (3000/3100 κατειλημμενα απο Docker, οπως
  παντα). `mcp__Claude_Browser__*` διαθεσιμο, `preview_start` OK, `read_console_messages` (onlyErrors) ->
  "No console logs." καθαρο (2×, πριν και μετα απο navigation). `javascript_tool` επιβεβαιωσε: το
  deterministic anchor id `faq-does-it-support-two-factor-authentication` υπαρχει
  (`getElementById(...)` -> true), το DOM περιεχει "recovery codes" (σωστο answer text), και η σειρα ειναι
  σωστη (`idx: 22`, neighbors = [faq-is-my-financial-data-secure, **αυτο**,
  faq-can-i-permanently-delete-my-account-and-all-its-data]). `get_page_text` επιβεβαιωσε clean render του
  hero/features/modules χωρις regression. Οπτικο screenshot της FAQ γραμμης απετυχε (`computer` scroll/
  screenshot timeout μετα απο ενα JS click, "Browser pane is currently hidden" σφαλμα, πιθανον προσωρινο
  rendering glitch του pane οχι της εφαρμογης) αλλα το hero screenshot πριν απο αυτο ηταν καθαρο και τα DOM/
  console checks ειναι επαρκης επιβεβαιωση (best-effort, η task file το επιτρεπει). Server σταματησε μετα
  (`pkill -f "next start -p 3120"`), `lsof -i :3120` επιβεβαιωσε clear.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged+committed ΜΟΝΟ το
  δικο μου landing path.

Επομενο increment: το `docs/saas.md` sweep συνεχιζεται· απομενουν sections χωρις ρητη landing αναφορα οπως
"Workspace console UI" (member management UI, ισως ηδη καλυπτεται εμμεσα απο το "add accounts for the
people you share with") και "Data export (GDPR)"/"Workspace erasure (GDPR)" (το delete-account FAQ ηδη
καλυπτει το erasure μερος σε γενικες γραμμες, το GDPR data-export endpoint ισως αξιζει ρητη αναφορα αν
διαφερει απο το ηδη-καλυμμενο JSON backup/export). Αλλιως (e) polish συνεχεια, real app screenshots οταν
υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (3) — FAQ += Hosted workspace invites & roles

Increment (e), συνεχεια του `docs/saas.md` sweep απο τα δυο προηγουμενα entries σημερα. Πριν το ξεκινημα:
coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος `~/.claude/ASK_ACHILLEAS.md` (δυο OPEN
entries, και τα δυο bakecore-finance, τιποτα για landing/pharos).

Το προηγουμενο entry σημερα ειχε σαν επομενα candidates το «Workspace console UI» (member management) και
τα GDPR export/erasure sections. Διαβασα `docs/saas.md:656-742` (Members and invitations, Invite management,
Workspace console UI) και βρηκα οτι ειναι **πληρως καλυμμενο live feature χωρις καθολου landing αναφορα**:
email invite με ρολο (owner/admin/member), `POST /api/saas/invites/resend` (re-mint token για ληγμενο
invite), revoke, remove member, και ενα append-only activity/audit trail (`GET /api/saas/audit`, owner/admin
only). Η υπαρχουσα FAQ γραμμη «Can my household or team share one instance?» ελεγε μονο «add accounts for
the people you share with», ασαφες για hosted (που εχει πραγματικο email-invite flow με ρολους, οχι απλα
«προσθεσε λογαριασμο»). Το GDPR data-export/erasure αφησα εκτος αυτου του run: το «Can I permanently delete
my account and all its data?» ηδη καλυπτει το erasure grace-window με ακριβεια, και το επιπλεον account-level
JSON-snapshot endpoint (`/api/saas/account/export`, profile+memberships only) θα ηταν πολυ λεπτη διακριση
απο το ηδη-καλυμμενο "JSON backup/import" για να αξιζει δικια του γραμμη, ρισκο redundancy στη FAQ λιστα.

Αλλαγη (`apps/landing/app/page.tsx`, FAQS array μονο, μηδεν UI/CSS/dependency/bundle-size change πλην του
νεου κειμενου): νεα εγγραφη «How do I invite people to a hosted workspace, and what can they do?» αμεσως
μετα το «Can my household or team share one instance?» και πριν το «How do updates work?» (θεματικη γειτονια,
share/team cluster). Απαντηση: email invite απο Settings → Members με ρολο (owner/admin/member),
resend/revoke/remove, append-only activity log, μονο owner μπορει να κανει promote σε owner, workspace ποτε
δεν μενει με μηδεν owners, με ρητη αντιπαραβολη στο self-hosted single shared login (ιδιο idiom με το
two-factor FAQ contrast line).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο rounded μεγεθος με το
  προηγουμενο increment).
- Browser preview: `next start -p 3130` πανω στο production build (3000/3100/3120 κατειλημμενα απο
  Docker/προηγουμενα runs). `mcp__Claude_Browser__*` διαθεσιμο, `preview_start` OK, `read_console_messages`
  (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: το deterministic anchor id
  `faq-how-do-i-invite-people-to-a-hosted-workspace-and-what-can-they-do` υπαρχει (`getElementById` -> true),
  σωστη σειρα (`idx: 7`, neighbors = [faq-can-my-household-or-team-share-one-instance, **αυτο**,
  faq-how-do-updates-work]), και το DOM περιεχει "resend an expired invite" (σωστο answer text).
  Screenshot του hero καθαρο, μηδεν regression. Server σταματησε μετα (`pkill -f "next start -p 3130"`),
  `ps aux | grep "next start"` επιβεβαιωσε κενο (το `lsof -i :3130` εδειξε παλι τα ιδια false-positive
  Claude-app "icpv2" TCP matches που εχουν σημειωθει σε προηγουμενα entries, οχι το node process μου).
- em-dash: 0 σε ολο το page.tsx. Δεν αγγιξα Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `app/page.tsx` modified (τρεχω απο το
  `apps/landing` cwd), `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file.
  Staged ΜΟΝΟ `apps/landing/app/page.tsx`.

Επομενο increment: το `docs/saas.md` sweep συνεχιζεται· απομενει το GDPR account-level data-export
endpoint (αν χρειαστει τελικα ρητη γραμμη) και τυχον νεα modules/commits απο το κυριο repo μετα απο αυτο το
run. Αλλιως (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (4) — FAQ += GDPR data export/portability (hosted)

Increment (e), συνεχεια του `docs/saas.md` sweep. Πριν το ξεκινημα: coordination guard
(`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος `~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα
δυο bakecore-finance, τιποτα για landing/pharos). `git log --oneline -15` εδειξε αλλα routines να δουλευουν
στο μεταξυ (mobile API docs, subscription/voucher tests) — εκτος του δικου μου territory, δεν τα αγγιξα.

Το προηγουμενο entry σημερα ειχε σαν ανοιχτο candidate το «GDPR account-level data-export endpoint (αν
χρειαστει τελικα ρητη γραμμη)». Διαβασα `docs/saas.md` γυρω απο τα GDPR sections (γραμμες 210-260, 373-380,
422-475, 531-, και το `/account/workspace/settings` entry στον UI-pages πινακα) και βρηκα **τρια ξεχωριστα
GDPR-portability endpoints χωρις καμια ρητη landing αναφορα**: (1) `GET /api/saas/account/export` απο
`/account/settings`, personal data JSON (profile+memberships) — Art. 15/20 right of access· (2)
`GET /api/saas/workspace/export` απο `/account/workspace/settings` (owner/admin only), πληρες workspace
content JSON· (3) `GET /api/saas/workspace/export/files` (owner/admin only), file-path manifest (metadata
only, οχι περιεχομενα). Η υπαρχουσα FAQ «Can I move between self-hosted and hosted?» καλυπτει ΗΔΗ ενα
διαφορετικο export (το whole-dataset merge-by-id migration export/import, self-hosted+hosted και τα δυο),
οχι τα GDPR rights-request downloads (hosted-only, account/workspace scoped, on-demand). Δυο διακριτα
concepts, αξιζε ξεχωριστη γραμμη ωστε να μην μπερδευονται.

Αλλαγη (`apps/landing/app/page.tsx`, FAQS array μονο, μηδεν UI/CSS/dependency/bundle-size change πλην του
νεου κειμενου): νεα εγγραφη «Can I download a copy of everything you have on me?» αμεσως μετα το «Does it
support two-factor authentication?» και πριν το «Can I permanently delete my account and all its data?»
(account/security/GDPR cluster στο τελος της λιστας, ιδιο idiom με τα προηγουμενα δυο increments). Απαντηση:
περιγραφει και τα τρια hosted downloads (account settings 1-click, workspace settings 2 ακομα για
owner/admin), ρητη αντιπαραβολη με το ηδη-καλυμμενο migration export, και μια γραμμη για self-hosted (ηδη
ολα τοπικα, τιποτα να ζητησεις).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο rounded μεγεθος).
- Browser preview: `next start -p 3140` πανω στο production build (3000/3100-3130 κατειλημμενα απο
  Docker/προηγουμενα runs). `mcp__Claude_Browser__*` διαθεσιμο, `preview_start` OK, `read_console_messages`
  (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: το deterministic anchor id
  `faq-can-i-download-a-copy-of-everything-you-have-on-me` υπαρχει (`getElementById` -> true), το DOM
  περιεχει "GDPR" (σωστο answer text), και η σειρα ειναι σωστη (`idx: 24`, neighbors =
  [faq-does-it-support-two-factor-authentication, **αυτο**,
  faq-can-i-permanently-delete-my-account-and-all-its-data]). Hero screenshot καθαρο, μηδεν regression.
  Server σταματησε μετα (`pkill -f "next start -p 3140"`), `lsof -i :3140` επιβεβαιωσε port clear.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `app/page.tsx` modified, `git diff --cached
  --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged ΜΟΝΟ `apps/landing/app/page.tsx`.

Επομενο increment: το `docs/saas.md` sweep εχει πλεον καλυψει ολα τα βασικα rights/account/security
sections (2FA, invites/roles, GDPR export ×3). Επομενο περασμα: ξανα-διαβασμα του docs/saas.md απο την
αρχη για οτιδηποτε αλλο module-level feature χωρις landing αναφορα (π.χ. superadmin/admin console, billing
webhook edge cases, bring-your-own-key AI ανα workspace — αυτο μπορει να αξιζει δικια του FAQ γραμμη, οχι
μονο mention μεσα σε αλλη). Αλλιως (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (5) — FAQ += bring-your-own-key AI per hosted workspace

Increment (e), συνεχεια του `docs/saas.md` sweep. Πριν το ξεκινημα: coordination guard
(`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος `~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα
δυο bakecore-finance, τιποτα για landing/pharos). `git status --short` εδειξε ηδη ενα uncommitted
`apps/landing/app/page.tsx` απο προηγουμενο run που δεν προλαβε να κανει commit (interrupted mid-increment,
οχι δικια μου αλλαγη αυτου του run) — ακριβως το candidate που ανεφερε το entry (4): "bring-your-own-key AI
ανα workspace". Το δουλεψα σαν in-progress συνεχεια αντι να το πεταξω (καμια αλλη ξενη αλλαγη στο tree).

Η υπαρχουσα αλλαγη (ηδη γραμμενη στο FAQS array, `apps/landing/app/page.tsx:449-452`): νεα εγγραφη «Can I
plug my own AI key into a hosted workspace too?» αμεσως μετα το «Do I need an AI API key?» και πριν το
«Can I talk to it in plain English instead of clicking through menus?» (AI cluster, θεματικη γειτονια).
Απαντηση: workspace settings δεχονται δικο σου Anthropic/OpenAI/Gemini/OpenRouter key, απο τοτε η AI χρηση
τρεχει πανω σε αυτο αντι για το shared platform quota (δεν μετραει πλεον στο μηνιαιο AI limit του plan), το
key ειναι encrypted at rest (AES-256-GCM, φρεσκια encryption καθε φορα) και δειχνεται πισω μονο masked
(τελευταια 4 χαρακτηρες, ποτε πληρες), clear οποτεδηποτε για επιστροφη στο included platform key· ρητη
σημειωση οτι το self-hosted παντα φερνει δικο του key ή τοπικο Ollama, αρα αυτο αφορα μονο hosted.

Verify (αυτο το run, απο το ηδη-γραμμενο κειμενο):
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο rounded μεγεθος με τα
  προηγουμενα increments).
- Browser preview: `next start -p 3150` πανω στο production build (3000/3100-3140 κατειλημμενα απο
  Docker/προηγουμενα runs). `mcp__Claude_Browser__*` διαθεσιμο, `preview_start` OK, `read_console_messages`
  (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: το deterministic anchor id
  `faq-can-i-plug-my-own-ai-key-into-a-hosted-workspace-too` υπαρχει (`getElementById` -> true), σωστη σειρα
  (`idx: 3`, neighbors = [faq-do-i-need-an-ai-api-key, **αυτο**,
  faq-can-i-talk-to-it-in-plain-english-instead-of-clicking-through-menus]), και το DOM περιεχει
  "AES-256-GCM" (σωστο answer text). Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, CTAs, τριπλο
  badge row), μηδεν regression. Server σταματησε μετα (`pkill -f "next start -p 3150"`), `lsof -i :3150`
  εδειξε μονο τα γνωστα false-positive Claude-app "nm-asses-admin" TCP CLOSE_WAIT matches (σημειωμενα ηδη σε
  προηγουμενα entries), οχι το node process.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged+committed ΜΟΝΟ το
  δικο μου landing path.

Επομενο increment: το `docs/saas.md` sweep απο την αρχη εχει πλεον καλυψει τα βασικα rights/account/security/
AI-BYOK sections. Επομενο περασμα: superadmin/admin console section (αν υπαρχει ρητο module χωρις landing
αναφορα), billing webhook edge cases (πιθανον πολυ implementation-level για FAQ, χρειαζεται ελεγχος πρωτα),
ή νεα modules/commits απο το κυριο repo μετα απο αυτο το run. Αλλιως (e) polish συνεχεια, real app
screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (6) — FAQ += what happens when the free trial ends

Increment (e), συνεχεια του `docs/saas.md` sweep. Πριν το ξεκινημα: coordination guard
(`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος `~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα
δυο bakecore-finance, τιποτα για landing/pharos). `git status --short` καθαρο (το προηγουμενο entry ειχε
προλαβει να κανει commit). `git log --oneline -15` εδειξε αλλα routines να δουλευουν στο μεταξυ (mobile
expense splitting, saas erasure-purge tests, statements installment tests) — εκτος του δικου μου territory,
δεν τα αγγιξα.

Το προηγουμενο entry σημειωσε δυο candidates: superadmin console και billing webhook edge cases. Διαβασα
και τα δυο (`docs/saas.md` γραμμες 768-846 για το superadmin, 675-684 για το billing) και κατεληξα: το
superadmin console ειναι **αμιγως platform-operator** surface (env allowlist `SAAS_SUPERADMIN_EMAILS`,
observability-only, καμια in-app διαδρομη για να γινει καποιος superadmin) — δεν αφορα πελατη, δεν αξιζει
FAQ γραμμη σε marketing σελιδα. Το billing webhook (Stripe checkout/portal/webhook mapping σε
Tenant.status) ειναι πολυ implementation-level, οχι ερωτηση που θα εκανε υποψηφιος πελατης.

Αντ' αυτου βρηκα ενα **κενο που αξιζε**: διαβαζοντας το «Workspace lifecycle» + «Trial dunning and lapse
sweep» section (γραμμες 89-130), το hosted trial μηχανισμο (14-μερο default trial, warn email 3 μερες πριν
τη ληξη, μετα suspend αν δεν προστεθει billing, οχι canceled/delete, ο owner το λυνει προσθετοντας billing
οποτεδηποτε) **δεν εμφανιζεται πουθενα στη landing σελιδα** (ουτε στα TIERS cards, ουτε στα FAQ) παρολο που
ειναι ακριβως το ειδος ερωτησης που θα εκανε καποιος πριν κανει "Join the waitlist" σε ενα πληρωμενο plan.
Ιδιο idiom με τα προηγουμενα increments (2FA/invites/GDPR): τεκμηριωνουμε hosted mechanics πριν το launch.

Αλλαγη (`apps/landing/app/page.tsx`, FAQS array μονο, μηδεν UI/CSS/dependency/bundle-size change πλην του
νεου κειμενου): νεα εγγραφη «What happens when my free trial ends?» αμεσως μετα το «How is hosted different
from self-hosted?» και πριν το «Can my household or team share one instance?» (hosted-lifecycle cluster,
θεματικη γειτονια). Απαντηση: 14-day trial, no card required to start, ενα reminder email 3 μερες πριν τη
ληξη, suspend (οχι delete) αν ληξει χωρις billing, recoverable με προσθηκη payment method οποτεδηποτε.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο rounded μεγεθος με ολα
  τα προηγουμενα increments).
- Browser preview: `next start -p 3160` πανω στο production build (3000/3100-3150 κατειλημμενα απο
  Docker/προηγουμενα runs). `mcp__Claude_Browser__*` διαθεσιμο, `preview_start` OK, `read_console_messages`
  (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: το deterministic anchor id
  `faq-what-happens-when-my-free-trial-ends` υπαρχει (`getElementById` -> βρεθηκε), σωστη σειρα (`idx: 7`,
  neighbors = [faq-how-is-hosted-different-from-self-hosted, **αυτο**,
  faq-can-my-household-or-team-share-one-instance]), και το `textContent` περιεχει το πληρες σωστο κειμενο
  ("14-day free trial", "suspended rather than deleted", κλπ). Hero screenshot καθαρο (lighthouse mark,
  gradient τιτλος, CTAs, τριπλο badge row), μηδεν regression. Server σταματησε μετα (`pkill -f "next start
  -p 3160"`), `lsof -i :3160` εδειξε μονο τα γνωστα false-positive Claude-app TCP CLOSE_WAIT matches
  (σημειωμενα ηδη σε προηγουμενα entries), οχι το node process.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged+committed ΜΟΝΟ τα
  δυο δικα μου landing paths.

Επομενο increment: το `docs/saas.md` sweep εχει πλεον καλυψει ολα τα σαφως customer-facing hosted mechanics
που εντοπιστηκαν (2FA, invites/roles, GDPR export ×3, BYO-key AI, trial lifecycle). Τα δυο εναπομειναντα
candidates (superadmin console, billing webhook internals) κρινονται non-FAQ-worthy (operator-only /
πολυ implementation-level). Επομενο περασμα: ξανα-ελεγχος για νεα modules/commits απο το κυριο repo μετα
απο αυτο το run, αλλιως (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (7) — FAQ += quick-capture bookmarklet / paste-a-URL import

Increment (e), σαρωση για νεα customer-facing features απο το κυριο repo (οπως προτεινε το προηγουμενο
entry). Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (δυο OPEN entries, και τα δυο bakecore-finance, τιποτα για landing/pharos).

Σαρωσα `git log --oneline -150 | grep feat(` για πραγματικα νεα features (οχι tests/docs) μετα το
τελευταιο landing entry: οι περισσοτερες προσφατες `feat(mobile)` commits ειναι parity-exposure ηδη-
υπαρχοντων web features (loyalty cards, savings goals, gift cards, expense splitting, bills tracker) που
ηδη καλυπτονται απο υπαρχοντα FAQ/feature-card κειμενο (feature-generic, οχι platform-specific, αρα
παραμενουν σωστα μετα το mobile parity). Βρηκα ομως ενα πραγματικο κενο: `93cc862 feat(items): quick-
capture bookmarklet` (P5 phase 1, merged πριν απο αυτο το run) πρoσθεσε ενα browser bookmarklet
(Settings → Storage & backup) που ανοιγει ενα same-origin `/capture?url=` popup πανω στο υπαρχον session
cookie (μηδεν CORS, μηδεν token στο link) και τρεχει το ηδη-υπαρχον `previewItemFromUrl`/
`confirmImportItem` pipeline· **δεν υπηρχε καμια αναφορα** σε αυτο, ουτε καν στο γενικοτερο paste-a-URL
AI-fill μηχανισμο, πουθενα στη landing σελιδα (ουτε FAQ ουτε feature cards).

Αλλαγη (`apps/landing/app/page.tsx`, FAQS array μονο, μηδεν UI/CSS/dependency/bundle-size change πλην του
νεου κειμενου): νεα εγγραφη «Can I add something to my list straight from a store's page?» αμεσως μετα το
«Can I move between self-hosted and hosted?» και πριν το «Can it read receipts and statements I already
have?» (capture/import cluster, θεματικη γειτονια). Απαντηση: paste URL -> AI fill (price/specs/category/
photo), και το bookmarklet ("Save to PHAROS", drag-to-bookmarks-bar + copy-code fallback απο Settings ->
Storage & backup) -> same-origin popup πανω στο υπαρχον session, οχι token, οχι extension, ιδιο preview-
before-confirm flow.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο rounded μεγεθος με ολα
  τα προηγουμενα increments).
- Browser preview: `next start -p 3170` πανω στο production build (3000/3100-3160 κατειλημμενα απο
  Docker/προηγουμενα runs). `mcp__Claude_Browser__*` διαθεσιμο, `preview_start` OK, `read_console_messages`
  (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: το deterministic anchor id
  ειναι `faq-can-i-add-something-to-my-list-straight-from-a-store-s-page` (το apostrophe γινεται `-s-` στο
  slug, οχι κοπτεται), σωστη σειρα (neighbors = [faq-can-i-move-between-self-hosted-and-hosted, **αυτο**,
  faq-can-it-read-receipts-and-statements-i-already-have]), και το `textContent` περιεχει το πληρες σωστο
  κειμενο ("Save to PHAROS", "same-origin popup", "no API token exposed"). Hero screenshot καθαρο
  (lighthouse mark, gradient τιτλος, CTAs, τριπλο badge row), μηδεν regression. Server σταματησε μετα
  (`pkill -f "next start -p 3170"`), `lsof -i :3170` εδειξε μονο τα γνωστα false-positive Claude-app TCP
  CLOSE_WAIT matches (σημειωμενα ηδη σε προηγουμενα entries), οχι το node process.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  `git diff --cached --name-only` κενο πριν το stage -> κανενα ξενο staged file. Staged+committed ΜΟΝΟ τα
  δυο δικα μου landing paths.

Επομενο increment: η σαρωση `feat(` commits εδειξε ενα ακομα πιθανο candidate οχι ακομα καλυμμενο ρητα σαν
standalone feature: το item document/manual vault (`ab2687e`, manuals/warranty-certs/serial-number photos
attached σε κοθε item) αναφερεται εμμεσα μονο μεσα στο insurance-export FAQ, οχι σαν δικια του γραμμη ή
feature-card mention. Υποψηφιο για επομενο περασμα αν κριθει αξιολογο σαν ξεχωριστη FAQ γραμμη (πιθανον
οχι, μαλλον καλυμμενο αρκετα μεσα στο υπαρχον insurance-export κειμενο). Αλλιως: νεα modules/commits απο
το κυριο repo μετα απο αυτο το run, ή (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets
(blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (8) — ROADMAP section hygiene: 3 items ξεπερασμενα, βρεθηκαν νεα unshipped candidates

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος `~/.claude/
ASK_ACHILLEAS.md` (3 OPEN entries, ολα bakecore, τιποτα για landing/pharos). `git log --oneline
e3f5919..HEAD` (e3f5919 = τελευταιο commit που αγγιξε το page.tsx) εδειξε 7 commits, μηδεν νεο `feat(`
απο το κυριο repo (μονο tests/docs/refactor) — αρα το FAQ sweep του προηγουμενου entry (docs/saas.md,
ολοκληρωμενο) δεν ειχε νεο υλικο να προσθεσει.

Αντ' αυτου εκανα κατι διαφορετικο: **audit του `ROADMAP` array** (Shipped/Building/Exploring columns,
γραμμη 397+) εναντια στον πραγματικο κωδικα, γιατι αυτο το section δεν ειχε ξανα-ελεγχθει απο οταν
γραφτηκε και το site εχει προχωρησει πολυ απο τοτε. Βρηκα **3 σαφως ξεπερασμενα items**:

1. **«Bring-your-own-key AI billing policy»** (Building) — ηδη SHIPPED: `apps/web/src/app/api/saas/
   workspace/ai-key/route.ts` υπαρχει και λειτουργει, και το ιδιο το FAQ array (γραμμη 450, commit
   `714ea71`, ΙΔΙΑ ημερα 2026-07-24) το περιγραφει ηδη σαν ζωντανο feature (AES-256-GCM encrypted key,
   masked display, fallback σε shared quota).
2. **«Eight-language interface localisation»** (Building) — ηδη SHIPPED: `apps/web/src/lib/i18n/locales/`
   εχει ακριβως 8 αρχεια (de/el/en/es/fr/it/nl/pt), `LocaleProvider.tsx` + `i18nActions.ts` wired στο
   layout/navbar. (Υπαρχει γνωστο partial-translation debt στο el.ts, καταγεγραμμενο στο `WEB_DEBT.md`,
   αλλα το ιδιο το feature, 8 επιλεξιμες γλωσσες με graceful English fallback, ειναι λειτουργικο· δεν
   ειναι «still building».)
3. **«Return-window reminders for recent buys»** (Exploring, «not yet scheduled») — ηδη SHIPPED (PA3):
   `apps/web/src/lib/returnWindow.ts` (+ `returnWindow.test.ts`) υπαρχει, wired σε
   `ReceiptsClient.tsx`/`receipts/page.tsx` (badge + closing alert) ΚΑΙ configurable global/per-store στο
   Settings.

**Fix**: και τα 3 μετακινηθηκαν στο **Shipped** column (μαζι με τα υπαρχοντα 6, τωρα 9 items). Αυτο
αδειασε το Building σε 1 μονο item («Managed multi-tenant hosted edition», που παραμενει σωστα «σε
εξελιξη», η SaaS engineering δουλεια ειναι εκτενης [βλ. `SAAS_PROGRESS.md`, route-test hardening] αλλα
το hosted προιον δεν εχει ακομα launch-αρει σε πραγματικους πελατες, `REPO_PUBLIC=false`) και το
Exploring σε 0.

Για να μην μεινει το Exploring column αδειο (θα εδειχνε σπασμενο σε ενα 3-column roadmap grid), εψαξα
το **`PRODUCT_BACKLOG.md` → `## Approved`** section (η αυθεντικη πηγη για εγκεκριμενα-αλλα-ανεπτυκτα
items, πιο αξιοπιστη απο manual grepping) για γνησια unshipped candidates αντι να μαντεψω:
- **P36** Open Banking auto-sync (GoCardless/Nordigen EU free tier), L, μεγαλος SaaS lever, ρητα
  unshipped («τελευταιο σε σειρα»).
- **P23**/**P17** Mobile share-sheet quick capture + barcode/QR scan, και τα δυο M, mobile-native,
  unshipped, ενωθηκαν σε μια γραμμη («Mobile share-sheet & barcode quick capture») γιατι ειναι
  θεματικα γειτονικα (mobile quick-capture).
- **P9** Multi-currency (per-transaction + FX), L, ρητα unshipped, τελευταιο σε προτεραιοτητα.
(Το **P31** household-multi-user deferred item ΔΕΝ το εβαλα, ειναι scoping-level nuance για ενα ηδη-
υπαρχον feature [self-host ηδη εχει admin/member roles], οχι ξεχωριστο νεο roadmap-worthy item για
marketing σελιδα.)

Αλλαγη (`apps/landing/app/page.tsx`, `ROADMAP` const μονο, γραμμες 397-434, μηδεν αλλο UI/CSS/dependency
change): 3 items μετακινηθηκαν Building/Exploring -> Shipped, Building εμεινε με 1 item, Exploring
αντικατασταθηκε με τα 3 νεα γνησια unshipped items.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο μεγεθος, το ROADMAP
  const ειναι build-time data μονο, μηδεν αλλαγη σε rendered bundle size).
- Browser preview: `next start -p 3150` πανω στο production build (κανενα port 3100-3190 κατειλημμενο
  αυτη τη φορα). `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` -> "No console logs."· hero
  screenshot καθαρο (lighthouse mark, gradient τιτλος, CTAs, τριπλο badge row). `javascript_tool`
  επιβεβαιωσε το πραγματικο DOM state του roadmap grid (`.roadmap-col` query): Shipped=9 items (τα 6
  παλια + τα 3 νεα, σωστη σειρα)· Building=1 item («Managed multi-tenant hosted edition»)· Exploring=3
  items (Open Banking / mobile share-sheet+barcode / multi-currency), ολα σωστα. Ενα scroll-attempt μετα
  εδειξε στιγμιαιο μαυρο screenshot (renderer glitch, οχι regression, `get_page_text` αμεσως μετα εδειξε
  το πληρες σωστο περιεχομενο ακομα φορτωμενο, μηδεν console error). Server σταματησε μετα (`pkill -f
  "next start -p 3150"`), `lsof -i :3150` καθαρο εκτος απο το γνωστο false-positive Claude-app TCP
  CLOSE_WAIT match (σημειωμενο ηδη σε προηγουμενα entries).
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: το ROADMAP audit αυτο αξιζει επαναληψη περιοδικα (καθε φορα που shipped features
συσσωρευονται χωρις να ξανα-ελεγχθει το section, οπως συνεβη εδω). Αλλιως: νεα modules/commits απο το
κυριο repo, ή (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (9) — FAQ += "Load sample data" (P1) before-you-commit onboarding

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (3 OPEN entries, ολα bakecore, τιποτα για landing/pharos).

`git log --oneline -- apps/landing/app/page.tsx` -> τελευταιο commit `a543502` (ROADMAP hygiene).
`git log --oneline a543502..HEAD` εδειξε 6 commits, μηδεν νεο `feat(` (μονο tests/docs/refactor) —
αρα το επομενο βημα που προτεινε το προηγουμενο entry («σαρωση για νεα modules/commits») δεν ειχε
νεο υλικο απο εκει.

Αντ' αυτου εκανα ενα ευρυτερο περασμα: `git log --oneline -300 | grep "feat("` σε ολοκληρο το repo
(οχι μονο μετα το τελευταιο landing commit) για candidates που μπορει να ειχαν περασει απο προηγουμενα
sweeps. Ελεγξα καθε ονομα-feature (webhooks, YNAB import, IMAP email-in, bills tracker, expense
splitting, per-property tag, global-search line-items, onboarding checklist, demo mode) εναντια στο
υπαρχον `page.tsx` κειμενο (grep keyword-by-keyword). Τα περισσοτερα ηδη καλυπτονται καπου (webhooks
στην alerts FAQ γραμμη 534, YNAB ΔΕΝ αναφερεται ρητα αλλα ειναι πολυ niche/implementation-level για
FAQ, splitting/per-property/global-search ολα ηδη εχουν δικια τους FAQ γραμμη). Βρηκα ομως ενα σαφες
κενο: **`61e2524 feat(settings): demo / sample-data mode (P1)`** — «Load sample data» στο Settings
γεμιζει Items/Receipts/Expenses/Subscriptions με ενα μικρο ρεαλιστικο locale-aware σετ (`isSample:true`
tagged, `lib/sampleData.ts`) ωστε μια φρεσκια self-host εγκατασταση να δειχνει αμεσως πως μοιαζει η
εφαρμογη σε χρηση, χωρις να χρειαζεται πραγματικα δεδομενα πρωτα, και «Clear sample data» το καθαριζει
χωρις να αγγιξει πραγματικα records. **Δεν αναφεροταν πουθενα** στη landing σελιδα, ουτε στα FEATURES
cards ουτε στο FAQ, παρολο που απαντα σε μια φυσικη αντιρρηση νεου χρηστη («θα καταλαβω πως δουλευει
πριν βαλω τα πραγματικα οικονομικα μου δεδομενα;»).

Αλλαγη (`apps/landing/app/page.tsx`, `FAQS` array μονο, μηδεν UI/CSS/dependency change): νεα εγγραφη
«Can I see what it looks like before adding my own data?» αμεσως μετα το «What do I need to run it?»
(ιδιο getting-started cluster, πριν το hosted-vs-self-hosted question) — περιγραφει το one-click load,
τα 4 τυπους δεδομενων, το isSample tagging/clean wipe, και οτι διαθεσιμο και στα δυο (self-hosted +
hosted).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο μεγεθος με ολα τα
  προηγουμενα increments, το FAQS array ειναι build-time data μονο).
- Browser preview: κανενα port 3100-3190 κατειλημμενο (μονο 3000/3100 απο Docker), `next start -p 3170`
  πανω στο production build. `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors)
  -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: deterministic anchor id
  `faq-can-i-see-what-it-looks-like-before-adding-my-own-data`, σωστο `textContent` (πληρες σωστο
  κειμενο), σωστη σειρα στο DOM (neighbors = [faq-what-do-i-need-to-run-it, **αυτο**,
  faq-how-is-hosted-different-from-self-hosted]). Server σταματησε μετα (`pkill -f "next start -p
  3170"`), `lsof -i :3170` εδειξε μονο το γνωστο false-positive Claude-app TCP CLOSE_WAIT match
  (σημειωμενο ηδη σε προηγουμενα entries), οχι το node process.
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: το ευρυτερο `feat(` sweep σε ολοκληρο το repo (οχι μονο μετα το τελευταιο landing
commit) αποδειχτηκε χρησιμο, θα το επαναλαβω περιοδικα. Υπολοιπο niche candidate που δεν κρινεται
FAQ-worthy: YNAB CSV migration importer (πολυ implementation-level/niche για marketing FAQ, καλυτερα
σε docs). Αλλιως: νεα modules/commits απο το κυριο repo μετα απο αυτο το run, ή (e) polish συνεχεια,
real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-24 (10) — FAQ += net-worth time-series (PA2 Reports feature)

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (3 OPEN entries, ολα bakecore finance/redesigner, τιποτα για landing).

`git log --oneline cdc6a03..HEAD | grep "feat("` -> κενο (μονο tests/docs/refactor commits μετα το
τελευταιο landing commit) — αρα συνεχισα με το ευρυτερο σαρωμα ολοκληρου του `feat(` ιστορικου
(`git log --oneline --all | grep "feat("`, 272 commits) που το προηγουμενο entry (9) ειχε ξεκινησει
σαν πρακτικη. Cross-check keyword-by-keyword εναντια στο υπαρχον `page.tsx`: τα περισσοτερα candidates
(splitting/who-owes-me, per-property tags, budget envelope, safe-to-spend, bills tracker, tax-deductible,
depreciation, return-window, IMAP email-in, bookmarklet, document vault, gift-card/store-credit, loyalty
card, price-hike alerts, webhooks, reconciliation, GDPR, MFA, BYO AI key) ηδη καλυπτονται (το πρωτο
grep-pass εδωσε false negatives σε μερικα γιατι η υπαρχουσα φραση δεν εχει την ακριβη λεξη-keyword,
π.χ. "split a shared cost" αντι "splitting" literal).

Βρηκα 4 γνησια κενα: net-worth time-series (PA2), vendor->category auto-rules (P15), bank/generic CSV
import (PA1), in-app onboarding checklist (P26). Εστειλα ερευνα σε background agent (sonnet, χωρις
guessing) να διαβασει τον πραγματικο κωδικα και να κρινει καθε ενα. Αποτελεσμα: net-worth (`lib/netWorth.ts`,
`models/NetWorthSnapshot.ts`) = μηνιαιο snapshot (assets: inventory value + manual accounts οπως μετρητα/
τραπεζικο υπολοιπο· liabilities: δοσεις + card balances), auto-upsert σε καθε ανοιγμα Reports, trend chart
μετα απο 2+ μηνες ιστορικο, δουλευει ιδια hosted/self-hosted (μηδεν local-file/AI dependency) — καθαρα
διαφορετικο απο το ηδη-mentioned "net position" (inventory - installments) που ειναι στιγμιαιο, οχι
time-series. Auto-rules + CSV import ειναι επισης καλα candidates αλλα αφησα τα για επομενο increment
(μια αλλαγη τη φορα). Onboarding checklist: ο agent προτεινε να ΜΗΝ μπει σε FAQ (implementation-level UI
chrome, οχι κατι που διαλεγεις το προιον γι' αυτο, και μια απο τις 5 steps [connect storage] ειναι
φρασεολογημενη γυρω απο self-hosted-style storage backends που θα ακουγοταν παραξενα σε καθαρα hosted
context) — συμφωνησα, το αφησα εξω.

Αλλαγη (`apps/landing/app/page.tsx`, `FAQS` array μονο, μηδεν αλλο UI/CSS/dependency change): νεα εγγραφη
«Does it track my net worth over time?» αμεσως μετα το «Can it help me save toward a goal?» (ιδιο Reports
cluster, savings goals -> net worth), πριν το «Can it notify me...» question.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο μεγεθος, το FAQS
  array ειναι build-time data μονο, μηδεν αλλαγη σε rendered bundle size). Το build αργησε ασυνηθιστα
  πολυ αυτη τη φορα (πανω απο 2 λεπτα, background-tracked μεχρι να τελειωσει) — πιθανον system load απο
  αλλες παραλληλες routines/Docker builds, οχι regression στο ιδιο το page.tsx.
- Browser preview: κανενα port 3100-3190 κατειλημμενο εκτος του 3100 (Docker), `next start -p 3110` πανω
  στο production build (γνωστο harmless "next start does not work with output:standalone" warning, ιδιο
  με ολα τα προηγουμενα increments — σερβιρει σωστα ουτως ή αλλως). `mcp__Claude_Browser__*` διαθεσιμο·
  `read_console_messages` (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: το νεο
  FAQ item βρεθηκε στο DOM (`found:true`), σωστη σειρα γειτονων (["Can it help me save toward a goal?",
  **αυτο**, "Can it notify me or plug into home automation?"]), deterministic anchor id
  `faq-does-it-track-my-net-worth-over-time`, σωστο πληρες `textContent`. Hero screenshot καθαρο
  (lighthouse mark, gradient τιτλος, CTAs, τριπλο badge row). Server σταματησε μετα (`pkill -f "next
  start -p 3110"`), λιμανι 3110 ελευθερο εκτος απο το γνωστο false-positive Claude-app TCP CLOSE_WAIT
  match (σημειωμενο ηδη σε προηγουμενα entries).
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call (η μονη agent-χρηση ηταν read-only research, οχι write).
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: τα 2 υπολοιπα candidates απο αυτο το σαρωμα, vendor->category auto-rules (P15) και
bank/generic CSV import (PA1), και τα δυο ηδη research-αρισμενα (βλ. πανω) και ετοιμα για μια FAQ
εγγραφη το καθενα. Αλλιως: νεα modules/commits απο το κυριο repo, ή (e) polish συνεχεια, real app
screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).


## 2026-07-24 (11) — FAQ += vendor→category auto-rules (P15 Expenses feature)

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (3 OPEN entries, ολα bakecore finance/redesigner, τιποτα για landing/pharos).

Συνεχεια απο το προηγουμενο entry (10): απο τα 2 υπολοιπα candidates του `feat(` sweep, vendor->category
auto-rules (P15) και bank/generic CSV import (PA1), διαλεξα το πρωτο για αυτο το run (μια αλλαγη τη φορα,
το CSV import μενει για το επομενο). Εστειλα background agent (sonnet, read-only, χωρις guessing) να
διαβασει τον πραγματικο κωδικα πριν γραψω οποιαδηποτε copy. Ευρηματα: η συναρτηση
`applyCategoryRulesToExisting()` (`apps/web/src/app/expenses/actions.ts:591-621`) ειναι ενα manual
"backfill" action (βρισκει Expense/Income με category='other'/κενο, τα τρεχει μεσα απο `matchCategoryRule`,
bulk-update). Το ιδιο rules engine (`apps/web/src/lib/categoryRules.ts`, τυπος `CategoryRule` με
match/matchType vendor-η-text/category/recurring/recurringCycle) τρεχει ΚΑΙ αυτοματα σε 3 σημεια
δημιουργιας (`createExpense` απο file upload, `addExpense` χειροκινητο, `importExpensesCsv`), οχι μονο
σε backfill οπως υπεθεσα αρχικα απο το ονομα της συναρτησης. Rules αποθηκευονται σε
`AppConfig.categoryRules`, UI = `CategoryRulesManager` στο Settings -> Money (πινακας edit rows + "Save"
+ "Apply to existing" combo button). Scope: ΜΟΝΟ Expense/Income (οχι Receipt), καθαρα διαφορετικο απο τα
line-item receipt store-name aliases. Δεν υπαρχει "inline always-categorize-X-as-Y" prompt πουθενα, ειναι
καθαρα settings-page rule editor· διορθωσα την αρχικη μου υποθεση στην FAQ copy ωστε να μην πλαστει οτι
υπαρχει τετοιο inline prompt.

Αλλαγη (`apps/landing/app/page.tsx`, `FAQS` array μονο, μηδεν αλλο UI/CSS/dependency change): νεα εγγραφη
«Can it learn to auto-categorize my expenses?» αμεσως μετα το «Does it track bills I pay by hand, like
utilities?» και πριν το «Can I see all my renewals, installments, and bills in one calendar?» (ιδιο
expenses-organization cluster).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο μεγεθος, το FAQS
  array ειναι build-time data μονο, μηδεν αλλαγη σε rendered bundle size). Το build αργησε παλι πανω απο
  2 λεπτα (background-tracked), ιδιο pattern με το προηγουμενο entry, πιθανον system load απο αλλες
  routines, οχι regression.
- Browser preview: 3100 κατειλημμενο (Docker), `next start -p 3110` πανω στο production build (γνωστο
  harmless "next start does not work with output:standalone" warning). `mcp__Claude_Browser__*`
  διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο. `javascript_tool`
  επιβεβαιωσε: deterministic anchor id `faq-can-it-learn-to-auto-categorize-my-expenses`, σωστο πληρες
  `textContent`, σωστη σειρα γειτονων στο DOM (["faq-does-it-track-bills-i-pay-by-hand-like-utilities",
  **αυτο**, "faq-can-i-see-all-my-renewals-installments-and-bills-in-one-calendar"]). Hero screenshot
  καθαρο (lighthouse mark, gradient τιτλος, CTAs, τριπλο badge row). ΣΗΜΕΙΩΣΗ: το πρωτο `pkill -f "next
  start -p 3110"` σκοτωσε μονο το npm-wrapper script, οχι το πραγματικο `next-server` child process
  (`lsof` εδειξε το process ακομα LISTEN μετα)· χρειαστηκε ενα δευτερο `kill <pid>` απευθειας στο
  next-server PID για να ελευθερωθει πραγματικα το port 3110. Καλο να το θυμαμαι σε επομενα runs
  (ελεγχος `lsof -i :<port>` ΜΕΤΑ το pkill, οχι μονο πριν).
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call (η μονη agent-χρηση ηταν read-only research, οχι write).
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: bank/generic CSV import (PA1), ηδη research-αρισμενο (το ιδιο background agent call
διαβασε και το `CsvImportModal.tsx`/`csvImport.ts`/`importExpensesCsv` -> RFC-4180 parser με
auto-delimiter-detect, column-mapping preview με live table, dedup key, sign-split option, ξεχωριστο και
συμπληρωματικο απο το statement PDF import). Ετοιμο για μια FAQ εγγραφη το επομενο run. Αλλιως: νεα
modules/commits απο το κυριο repo, ή (e) polish συνεχεια, real app screenshots οταν υπαρξουν assets
(blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-25 (12) — FAQ += bank/generic CSV import (PA1 Expenses feature)

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (3 OPEN entries, ολα bakecore finance/redesigner, τιποτα για landing/pharos).
`git log --oneline cbd0e4b..HEAD | grep "feat("` -> κενο (μονο tests/docs/fix commits μετα το τελευταιο
landing commit), αρα συνεχισα με το candidate που ειχε μεινει απο το προηγουμενο entry (11): bank/generic
CSV import (PA1), ηδη research-αρισμενο τοτε απο ενα background agent read-only pass.

Διαβασα ο ιδιος τον πραγματικο κωδικα πριν γραψω copy (`lib/csvImport.ts`, `expenses/CsvImportModal.tsx`,
`expenses/actions.ts importExpensesCsv`) για να επιβεβαιωσω τις λεπτομερειες: auto-delimiter-detect
(comma/semicolon/tab, μετρα candidates εκτος quotes), `guessMapping` απο header keywords Αγγλικα+Ελληνικα
(date/amount/vendor/category/notes), live preview table πριν το save, `parseCsvAmount` δεχεται EU
(1.234,56) και US (1,234.56) format με σωστο tie-break στο τελευταιο separator, `parseCsvDate` day-first
by default με swap μονο οταν day-first ειναι αδυνατο. Το "sign-split" checkbox (`signSplit` state,
ενεργο μονο `hasNegatives`) χωριζει αρνητικα/θετικα ποσα σε expense/income αυτοματα οταν το export εχει
ενα signed column· χωρις αυτο ολες οι γραμμες παιρνουν το kind του tab που ανοιξες (Expenses ή Income).
Server-side dedup (`csvDedupeKey`, kind+vendorKey+ημερα+|amount|) εναντια σε ηδη-υπαρχοντα Expense records
στο ιδιο date range, και category rules (απο το προηγουμενο entry 11) τρεχουν αυτοματα στις νεες γραμμες
μεσω `inheritFromSeries`.

Αλλαγη (`apps/landing/app/page.tsx`, `FAQS` array μονο, μηδεν αλλο UI/CSS/dependency change): νεα εγγραφη
«Can I bulk-import expenses from a bank export?» αμεσως μετα το «Can it learn to auto-categorize my
expenses?» (η νεα CSV εγγραφη αναφερει explicit τα category rules) και πριν το «Can I see all my
renewals, installments, and bills in one calendar?» (ιδιο expenses-organization cluster, οπως ειχε
σχεδιαστει στο entry 11).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (ιδιο μεγεθος, build-time
  data μονο).
- Browser preview: κανενα port 3100-3190 κατειλημμενο εκτος του 3100 (Docker), `next start -p 3110` πανω
  στο production build. `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No
  console logs." καθαρο. `javascript_tool` επιβεβαιωσε: deterministic anchor id
  `faq-can-i-bulk-import-expenses-from-a-bank-export`, σωστο πληρες `textContent`, σωστη σειρα γειτονων
  στο DOM (["faq-can-it-learn-to-auto-categorize-my-expenses", **αυτο**,
  "faq-can-i-see-all-my-renewals-installments-and-bills-in-one-calendar"]). Hero screenshot καθαρο
  (lighthouse mark, gradient τιτλος, CTAs, τριπλο badge row). `pkill -f "next start -p 3110"` +
  επιβεβαιωση οτι το πραγματικο `next-server` process εφυγε (`ps aux | grep next-server`, κενο) — το
  γνωστο false-positive Claude-app TCP CLOSE_WAIT match στο `lsof -i :3110` παραμενει (σημειωμενο ηδη σε
  προηγουμενα entries, δεν ειναι το server process).
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: το `feat(` sweep εξαντληθηκε προς το παρον (ολα τα candidates απο το τελευταιο ευρυ
σαρωμα καλυφθηκαν: net-worth, auto-rules, CSV import). Επομενο run: νεος `git log --oneline cbd0e4b..HEAD
| grep "feat("` ελεγχος για φρεσκα modules/commits απο το κυριο repo· αν κενο παλι, ξανα-σαρωμα ολοκληρου
του `feat(` ιστορικου για candidates που μπορει να ξεφυγαν απο τα πρωτα keyword-passes, ή (e) polish
συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-25 (13) — FAQ += inventory depreciation model (P29), πληρες ξανα-σαρωμα του feat( ιστορικου

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (5 OPEN entries πλεον, ολα bakecore finance/redesigner/tests/reviewer, τιποτα
για landing/pharos). `git log --oneline bbddf1c..HEAD | grep "feat("` -> κενο, οπως προβλεφθηκε στο
προηγουμενο entry (12): μονο tests/docs/fix commits εχουν μπει μετα το τελευταιο landing commit.

Ακολουθησα το προγραμματισμενο fallback: `git log --oneline --all | grep "feat("` πανω σε ολοκληρο το
repo (οχι μονο μετα απο ενα cutoff commit), ~110 αποτελεσματα. Συγκρινα με τα υπαρχοντα FAQS entries
(grep FAQ q: στο page.tsx, 33 εγγραφες συνολικα πλεον) και με το Features section (σειρα 439-571 + το
grid των module καρτων ~σειρα 40-90). Βρηκα αρκετα consumer-facing P-numbered features που ΔΕΝ εχουν
dedicated FAQ (καποια μονο ακουμπανε επιφανειακα σε αλλη εγγραφη ή στο Features blurb):
- P29 asset depreciation model: αναφερεται ΜΟΝΟ ως "depreciation-adjusted estimate" μεσα στην insurance-
  export FAQ, καμια εξηγηση τι κανει -> **διαλεχτηκε για αυτο το run**.
- P27 suggest monthly budgets απο spending history: καμια αναφορα πουθενα.
- P22 receipt line-item search απο global search: καμια αναφορα πουθενα.
- P21 document/manual vault: καμια αναφορα πουθενα.
- P16 YNAB CSV register migration importer (διαφορετικο απο το ηδη-καλυμμενο bank/generic CSV import PA1):
  καμια αναφορα.
- P26 in-app onboarding checklist: internal UX, οχι πολυ landing-worthy, χαμηλη προτεραιοτητα.
- P20/P32 loyalty cards + gift-card/store-credit, P33 free-trial cancel reminder, P19 safe-to-spend,
  P25 budget envelope/rollover, P3 Month in Review, P11 IMAP email-in: ΟΛΑ ηδη αναφερονται (εστω συνοπτικα)
  στο Features section blurbs (σειρες 56/68/73-74/80/409-413) -> ΔΕΝ θεωρουνται κενα, ηδη "καλυμμενα".

Espesta agent (sonnet, read-only, Explore) διαβασε το πραγματικο κωδικα του depreciation feature πριν
γραψω copy: `lib/depreciation.ts` (declining-balance formula, οχι straight-line· `value = price *
(1-rate)^years`, floor στο salvage %, per-category default rates network 15/storage 20/compute 25/audio
12/video 20/mobile 25/peripheral 18/consumable 50/other 15/), `resolveDepreciation()` (AppConfig.depreciation,
Settings -> Depreciation UI: master toggle, default rate, floor, per-category overrides), `estimatedItemValue()`
(manual currentPrice override wins μονο αν διαφερει >0.005 απο purchasedPrice, αλλιως depreciates). Επιβεβαιωσα
οτι η ιδια συναρτηση τροφοδοτει ΚΑΙ το Reports (owned net-worth + inventory pie) ΚΑΙ το insurance export
(`settings/actions.ts:1343-1346`), οπως ηδη ισχυριζοταν η υπαρχουσα FAQ εγγραφη· η depreciated value ΔΕΝ
εμφανιζεται πουθενα στο item-detail page, μονο σε Reports+export.

Αλλαγη (`apps/landing/app/page.tsx`, `FAQS` array μονο, μηδεν αλλο UI/CSS/dependency change): νεα εγγραφη
«How does it estimate what my stuff is still worth?» αμεσως μετα το «Can it produce an export for an
insurance claim?» (η υπαρχουσα εγγραφη αναφερει explicit τη λεξη depreciation, φυσικο follow-up) και πριν
το «Can it help with tax filing at year-end?».

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο)· `/` route 5.35 kB (build-time data μονο,
  μηδεν rendered bundle αλλαγη).
- Ελεγχος πορτων 3100-3190: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production
  build (γνωστο harmless "next start does not work with output:standalone" warning). `mcp__Claude_Browser__*`
  διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο. `javascript_tool`
  επιβεβαιωσε: `found:true`, deterministic anchor id
  `faq-how-does-it-estimate-what-my-stuff-is-still-worth`, σωστο πληρες `textContent`, σωστη σειρα
  γειτονων στο DOM (["faq-can-it-produce-an-export-for-an-insurance-claim", **αυτο**,
  "faq-can-it-help-with-tax-filing-at-year-end"]). Hero screenshot καθαρο (lighthouse mark, gradient
  τιτλος, CTAs, τριπλο badge row). `pkill -f "next start -p 3110"` -> επιβεβαιωθηκε οτι κανενα
  `next-server` process δεν εμεινε (`ps aux | grep next-server`, κενο)· το γνωστο false-positive
  Claude-app CLOSE_WAIT match στο `lsof -i :3110` παραμενει (ιδιο σημειο με προηγουμενα entries).
- em-dash: 0 σε ολο το page.tsx (comma-list style, ιδιο με ολα τα προηγουμενα increments). Δεν αγγιξα
  Docker/:3000/web/mobile, μηδεν AI call (η μονη agent-χρηση ηταν read-only research, οχι write).
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Commit `57a58bb`, pushed στο `origin/main` (25ff5a7..57a58bb).

Επομενο increment: 3 fresh candidates απο το πληρες ξανα-σαρωμα, με σειρα προτεραιοτητας: (1) P27
suggest-monthly-budgets-from-history (αμεσα χρησιμο, ταιριαζει με το ηδη-υπαρχον budgets FAQ cluster),
(2) P22 receipt line-item global search (μικρο discoverability feature, ταιριαζει με το search command-bar
FAQ), (3) P21 document/manual vault (item warranties/manuals, ταιριαζει με το insurance-export cluster).
P16 YNAB migration importer μενει σε χαμηλοτερη προτεραιοτητα (niche, migration-only χρηση). Αλλιως: νεα
`feat(` commits απο το κυριο repo, ή (e) polish συνεχεια / real app screenshots οταν υπαρξουν assets
(blocked).

Needs-Achilleas (open, αμεταβλητα):
- Legal entity name + payment processor (Stripe): confirm ΠΡΙΝ hosted launch.
- Terms + Privacy: full legal review ΠΡΙΝ launch· μετα flip robots -> indexable + add στο sitemap.
- Contact inbox hello@ph-aros.com, hosted τιμες (€4/€8/€15 + annual ×10): confirm ΠΡΙΝ launch.
- Repo public: κρατιεται private προς το παρον (οταν ανοιξει, το free-tier Offer γινεται InStock αυτοματα).

## 2026-07-25 (cont.)

Task: επομενο increment απο τη λιστα προτεραιοτητας του προηγουμενου entry: (1) P27 suggest-monthly-
budgets-from-history.

Espesta agent (Explore, read-only) διαβασε το πραγματικο κωδικα πριν γραψω copy: `lib/budgetSuggest.ts`
(`suggestBudgetsFromExpenses`, deterministic χωρις AI), server action `settings/actions.ts` `suggestBudgets`
(hardcoded `months=3`), UI `SettingsClient.tsx` `BudgetsManager` component. Επιβεβαιωθηκε: buckets non-income
expenses ανα category × μηνα, παιρνει το **median** (οχι average) μηνιαιο συνολο ανα category πανω απο
trailing 3 ΟΛΟΚΛΗΡΩΜΕΝΟΥΣ μηνες (εξαιρει τον τρεχοντα), rounds στο κοντινοτερο €5, skip categories με
λιγοτερους απο 2 distinct μηνες ιστορικου. UI = κουμπι "Suggest from history" δικα στο Settings -> Money,
pre-fills τα input fields μονο (ΔΕΝ αυτο-αποθηκευει, ο χρηστης πρεπει να πατησει "Save budgets").

Αλλαγη (`apps/landing/app/page.tsx`, `FAQS` array μονο): νεα εγγραφη «Can it suggest a budget for me
instead of me guessing numbers?» αμεσως μετα το «Can it learn to auto-categorize my expenses?» (ιδιο
Settings->Money cluster) και πριν το «Can I bulk-import expenses from a bank export?».

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` επιβεβαιωσε: `found:true`, σωστο anchor id
  `faq-can-it-suggest-a-budget-for-me-instead-of-me-guessing-numbers`, σωστη σειρα γειτονων στο DOM
  (["faq-can-it-learn-to-auto-categorize-my-expenses", **αυτο**, "faq-can-i-bulk-import-expenses-from-a-bank-export"]).
  Hero screenshot καθαρο. `pkill -f "next start -p 3110"` -> επιβεβαιωθηκε οτι κανενα `next-server` process
  δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx.
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only research, μηδεν AI call για copy
  generation (η ιδια η routine εγραψε το copy απο τα read-only findings).
- Collision guard: `git status --short` πριν το add εδειξε `apps/landing/app/page.tsx` modified απο εμενα
  + ενα ΞΕΝΟ `docs/DOCS_PROGRESS.md` (προϋπαρχον απο αλλη routine, οχι δικο μου) -> το αφησα εντελως αθικτο,
  staged ΜΟΝΟ τα δικα μου 2 αρχεια.

Επομενο increment: 2 fresh candidates απο τη λιστα προτεραιοτητας: (1) P22 receipt line-item global search,
(2) P21 document/manual vault. Αλλιως: νεα `feat(` commits απο το κυριο repo, ή polish συνεχεια / real app
screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενο entry (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-25 (14) — P9 multi-currency (Expenses/Income): νεα FAQ + roadmap fix

Πριν το ξεκινημα: coordination guard (`~/.claude/ROUTINES_PAUSED` δεν υπαρχει), ελεγχος
`~/.claude/ASK_ACHILLEAS.md` (6 OPEN entries πλεον, ολα bakecore + το pharos-daily-dev mobile-camera
question, τιποτα για landing/pharos-landing). `git log --oneline 57a58bb..HEAD | grep "feat("` (57a58bb =
τελευταιο commit που αγγιξε το apps/landing) εβγαλε 2 φρεσκα: `f83ff71 feat(money): multi-currency
foundation + Expenses (P9 slice 1)` και `83750f6 feat(api): barcode product lookup endpoint (P17 server
half)`.

Το P17 ειναι μονο server-half (το UI/mobile κομματι ειναι blocked, βλ. OPEN ερωτηση
`pharos-daily-dev-20260725-1425` στο inbox: περιμενει εγκριση για `expo-camera`) -> δεν ειναι ακομα user-
facing feature, δεν ειναι ετοιμο για landing copy. Επελεγη το **P9 multi-currency** για αυτο το run: εχει
πραγματικο shipped UI (opt-in toggle, δουλευει σημερα).

Espesta agent (Explore, read-only) διαβασε τον πραγματικο κωδικα πριν γραψω copy (οχι μονο τα docs/*.md
summaries): `lib/fx.ts` (pure module, `AppConfig.multiCurrency` = ενα deployment-wide boolean, off by
default -> μηδεν αλλαγη στη φορμα οταν off), `models/Expense.ts` (νεα πεδια `origAmount`/`fxRate`, το
`amount` μενει ΠΑΝΤΑ base-currency, `amount = origAmount * fxRate`), το FX rate ειναι **χειροκινητο** (οχι
API fetch) — direct rate field ή "τι σε χρεωσε τελικα" back-out field (`deriveFxRate`). Αν μεινει
αγνωστο (rate=0), ΔΕΝ μαντευει 1:1, δειχνει gold warning badge. Scope: ΜΟΝΟ Expenses+Income (ιδιο μοντελο,
kind income/expense) — Receipts/Statements/Subscriptions/Items ΔΕΝ αγγιχτηκαν ακομα (PRODUCT_BACKLOG.md το
σημειωνει ρητα ως επομενο slice). CURRENCIES = 14 built-in codes αλλα `normalizeCurrency()` δεχεται
οποιοδηποτε ISO 4217 3-γραμματο code.

Αλλαγες (`apps/landing/app/page.tsx`, 2 σημεια, ιδιο αρχειο με παντα):
1. Νεα FAQ εγγραφη «Can it handle an expense in a currency other than my main one?» στο money/expenses
   cluster, αμεσως μετα το «Can I bulk-import expenses from a bank export?» και πριν το «Can I see all my
   renewals, installments, and bills in one calendar?».
2. **Roadmap fix**: το `ROADMAP` array ειχε "Multi-currency support" ακομα κατω απο **Exploring** ("not yet
   scheduled") — ξεπερασμενο τωρα που ειναι πραγματικα shipped. Μετακινηθηκε στο **Shipped** ως "Opt-in
   multi-currency for expenses & income" (ακριβες wording, οχι υπερβολικο "multi-currency support" γενικα
   αφου δεν καλυπτει ολα τα modules ακομα), και αφαιρεθηκε απο το Exploring block.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη αφου
  ολα build-time data).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build
  (γνωστο harmless standalone warning). `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages`
  (onlyErrors) -> "No console logs." καθαρο. `javascript_tool` επιβεβαιωσε: `found:true`, σωστο anchor id
  `faq-can-it-handle-an-expense-in-a-currency-other-than-my-main-one`, σωστη σειρα γειτονων στο DOM
  (["faq-can-i-bulk-import-expenses-from-a-bank-export", **αυτο**,
  "faq-can-i-see-all-my-renewals-installments-and-bills-in-one-calendar"]). Roadmap check: body text
  περιεχει "Opt-in multi-currency for expenses & income" κατω απο Shipped, και το bare "Multi-currency
  support" εφυγε απο το Exploring block (regex check και στα δυο). Hero screenshot καθαρο (lighthouse mark,
  gradient τιτλος, nav με Compare/Roadmap links, τριπλο badge row). `pkill -f "next start -p 3110"` ->
  επιβεβαιωθηκε οτι κανενα `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx.
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only research (Explore), μηδεν AI call
  για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Commit `d3bae99`, pushed στο `origin/main` (792a028..d3bae99).

Επομενο increment: 2 candidates απο την προηγουμενη λιστα προτεραιοτητας παραμενουν ανοιχτα (P22 receipt
line-item global search, P21 document/manual vault). Επισης νεο εδω: αν το P17 mobile UI εγκριθει και
χτιστει σε επομενο pharos-daily-dev run, θα γινει landing-worthy τοτε (τωρα μονο server-half, οχι ακομα).
Αλλιως: νεος `git log --oneline d3bae99..HEAD | grep "feat("` ελεγχος, ή polish συνεχεια / real app
screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενο entry (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-25 (15) — P9 Receipts multi-currency: fix stale FAQ claim + roadmap wording

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (8 OPEN
entries πλεον, ολα bakecore + το pharos-daily-dev mobile-camera question, τιποτα για landing/pharos-landing,
τιποτα ANSWERED προς αυτη τη routine).

`git log --oneline d3bae99..HEAD | grep "feat("` (d3bae99 = τελευταιο commit που αγγιξε το apps/landing,
προηγουμενο entry) εβγαλε ενα φρεσκο: `25cb2c2 feat(money): multi-currency for Receipts (P9 slice 2)`.

Αυτο ΔΕΝ ηταν μονο νεο feature προς προσθηκη· βρηκα οτι η ΗΔΗ-υπαρχουσα FAQ εγγραφη για multi-currency
(απο το προηγουμενο entry, #14 σημερα) εχει τωρα **λανθασμενο ισχυρισμο**: "It currently covers expenses
and income; receipts, statements, and subscriptions are still base-currency only for now" — το receipts
κομματι ειναι πλεον ψευδες.

Espesta agent-less read-only research (Read directly, το read-only ηταν αμεσο χωρις να χρειαστει Explore
subagent): διαβασα `apps/web/src/lib/fx.ts` (το ιδιο pure FX module που ηδη τεκμηριωνεται, INVARIANT: amount
παντα base-currency, resolveFx/toPrinted/deriveFxRate) και `apps/web/src/app/receipts/actions.ts` (4 write
paths: upload/updateReceipt/quickVerifyReceipt/rescanReceipt, ολα περνανε απο resolveFx). Η διαφορα απο το
Expenses μοντελο: μια αποδειξη εχει ΠΟΛΛΑ ποσα οχι ενα (total/net/vatAmount/line prices), και **ΟΛΑ**
converts με το ΙΔΙΟ rate (οχι μονο το total) — γιατι τα Reports αθροιζουν vatAmount και η item library
αντιγραφει line prices στο Item.purchasedPrice, αρα ενα μισο-converted receipt θα δηλητηριαζε και τα δυο.
Το total κρατα το printed value verbatim (origAmount), τα υπολοιπα recovered για editing μεσω fx.toPrinted().
Επιβεβαιωσα και στο `ReceiptsClient.tsx` (form.currency/form.fxRate, ιδιο `fx.enabled` toggle απο
Settings, ιδιο UI pattern με Expenses: currency picker + rate field στη φορμα).

Αλλαγες (`apps/landing/app/page.tsx`, 2 σημεια, ιδιο αρχειο με παντα):
1. FAQ fix: το ιδιο question "Can it handle an expense in a currency other than my main one?" (anchor id
   αμεταβλητο, δεν αλλαξε το question text) — νεο answer: "the expense, income, and receipt forms" (πριν
   μονο expense/income), νεα προταση "On a receipt every amount converts with that same rate, not just
   the total, since reports sum VAT and the item library copies line prices into your inventory, so a
   half-converted receipt would throw both off.", και το τελευταιο προταση εγινε "It currently covers
   expenses, income, and receipts; statements and subscriptions are still base-currency only for now."
   (αντι "expenses and income ... receipts, statements, and subscriptions").
2. Roadmap fix: "Opt-in multi-currency for expenses & income" -> "Opt-in multi-currency for expenses,
   income & receipts" στο Shipped block.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` επιβεβαιωσε: `found:true`, σωστο πληρες `textContent` (περιεχει "the expense, income,
  and receipt forms" και "On a receipt every amount converts..."), roadmap string check: νεο wording
  "Opt-in multi-currency for expenses, income & receipts" παρον, παλιο "expenses & income" wording
  απουσιαζει. Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav, τριπλο badge row).
  `pkill -f "next start -p 3110"` -> επιβεβαιωθηκε οτι κανενα `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx.
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only Read (χωρις subagent, το scope
  ηταν μικρο, 2 αρχεια), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: 2 candidates παραμενουν απο τη λιστα προτεραιοτητας (P22 receipt line-item global
search, P21 document/manual vault). Αλλιως: νεος `git log --oneline 25cb2c2..HEAD | grep "feat("` ελεγχος
στην αρχη του επομενου run, ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-25 (16) — P9 Subscriptions multi-currency: fix stale FAQ claim + roadmap wording

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (8 OPEN
entries πλεον, ολα bakecore + το pharos-daily-dev mobile-camera question, τιποτα ANSWERED προς αυτη τη
routine).

`git log --oneline 25cb2c2..HEAD | grep "feat("` (25cb2c2 = τελευταιο commit που αγγιξε το apps/landing,
προηγουμενο entry) εβγαλε ενα φρεσκο: `b2e72ce feat(money): multi-currency for Subscriptions (P9 slice 3)`.
Υπηρχε επισης `3c9d170 docs(P9): document multi-currency support for Subscriptions`, αλλα αυτο ειναι δικο
του pharos-daily-dev commit που αγγιξε `docs/api.md`/`docs/features.md` (γενικο repo docs), οχι το landing
site· δεν καλυπτει τη δουλεια αυτου του run.

Ιδιο pattern με τα δυο προηγουμενα entries: η ηδη-υπαρχουσα multi-currency FAQ (απο #14/#15) εχει τωρα
ξεπερασμενο ισχυρισμο ("statements and subscriptions are still base-currency only for now" — το
subscriptions κομματι πλεον ψευδες).

Read-only research (Read directly, μηδεν subagent, μικρο scope): `models/Subscription.ts` (νεα πεδια
`origAmount`/`fxRate`, ιδιο invariant με Receipts/Expenses — `amount` παντα base currency) και
`app/subscriptions/actions.ts` (`resolveSubFx` helper, γραμμες 87-105): το **ιδιο rate** converts ΚΑΙ το
recurring `amount` ΚΑΙ το post-trial `firstChargeAmount` (οχι μονο ενα απο τα δυο), γιατι και τα δυο
αθροιζονται σε base currency αλλου (monthly/yearly totals, calendar agenda, trial-charge digest) — ενα
μισο-converted subscription θα εμπλεκε δυο νομισματα μεσα στην ιδια εγγραφη. Αγνωστο rate: το printed
number μενει αναλλοιωτο, ιδιο pattern με τα αλλα (gold badge, οχι σιωπηλο 1:1 guess).

Αλλαγες (`apps/landing/app/page.tsx`, 2 σημεια, ιδιο αρχειο με παντα):
1. FAQ fix: το ιδιο question "Can it handle an expense in a currency other than my main one?" (anchor id
   αμεταβλητο) — νεο answer: "the expense, income, receipt, and subscription forms" (πριν χωρις
   subscription), νεα προταση για το subscription behavior ("A foreign-currency subscription converts its
   recurring charge and its post-trial first-charge amount with that same rate too, so a 'cancel before
   you get charged' reminder and the monthly/yearly totals never mix currencies inside one record."), και
   το τελευταιο προταση εγινε "It currently covers expenses, income, receipts, and subscriptions;
   statements are still base-currency only for now." (αντι "...receipts; statements and subscriptions...").
2. Roadmap fix: "Opt-in multi-currency for expenses, income & receipts" -> "Opt-in multi-currency for
   expenses, income, receipts & subscriptions" στο Shipped block.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` επιβεβαιωσε: `found:true`, σωστη σειρα γειτονων στο DOM
  (["faq-can-i-bulk-import-expenses-from-a-bank-export", **αυτο**,
  "faq-can-i-see-all-my-renewals-installments-and-bills-in-one-calendar"]), σωστο textContent με "the
  expense, income, receipt, and subscription forms". Roadmap check: νεο wording "Opt-in multi-currency for
  expenses, income, receipts & subscriptions" παρον (`hasNew:true`), παλιο wording απουσιαζει
  (`hasOld:false`). Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav, τριπλο badge row).
  `pkill -f "next start -p 3110"` -> επιβεβαιωθηκε οτι κανενα `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx.
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only Read (χωρις subagent), μηδεν AI
  call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: 2 candidates παραμενουν απο τη λιστα προτεραιοτητας (P22 receipt line-item global
search, P21 document/manual vault). Αλλιως: νεος `git log --oneline b2e72ce..HEAD | grep "feat("` ελεγχος
στην αρχη του επομενου run, ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-25 (17) — P9 Items + Statements multi-currency: FAQ/roadmap now cover all 6 record types

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (11 OPEN
entries πλεον, ολα bakecore + το pharos-daily-dev mobile-camera question, τιποτα ANSWERED προς αυτη τη
routine).

`git log --oneline b2e72ce..HEAD | grep "feat("` (b2e72ce = τελευταιο source commit που αντικατοπτριστηκε
στο landing, βλ. entry #16) εβγαλε δυο φρεσκα: `8e13724 feat(money): multi-currency for Items (P9 slice 4)`
και `2e408ff feat(money): multi-currency for Statements (P9 slice 5)`. Το `PRODUCT_BACKLOG.md` header για
P9 πλεον λεει "FOUNDATION + EXPENSES + RECEIPTS + SUBSCRIPTIONS + ITEMS + STATEMENTS SHIPPED" — αυτο ειναι
ολοκληρωση ολων των record types που ειχε στοχευσει το P9 (μονο imports/rate-feed εκκρεμουν, εκτος landing
scope).

Read-only research (Read directly, μηδεν subagent, 2 μικρα `git show --stat`/commit-message reads):
διαβασα τα commit messages των 8e13724 και 2e408ff (οχι πληρες diff, το commit message ηδη περιγραφει το
behavior με ακριβεια αρκετη για marketing copy). Items: ΤΡΙΑ money πεδια (purchasedPrice/currentPrice/
targetPrice) converts μαζι με ΕΝΑ rate (fx.resolveItemPrices), γιατι net worth + P13 insurance export τα
αθροιζουν και τα δυο· origAmount = οτι πληρωθηκε αν owned, αλλιως η ζητουμενη τιμη· store-link τιμες
(links[].price) και παλιο priceHistory[].currency ΔΕΝ converts (σκοπιμα, ωστε το "cheapest link" να μενει
ιδιο). Statements: ΕΝΑ rate converts ΟΛΟΚΛΗΡΟ το εγγραφο (total/minimum/paid ΚΑΙ καθε transaction amount),
γιατι το computeInstallmentPlans αθροιζει τα charges σε payoff figures που δειχνει το homepage/calendar/
reports σε base currency· update un-converts με το OLD rate πριν εφαρμοσει νεο (rate correction παει στα
τυπωμενα νουμερα, οχι stack πανω σε past conversion) — ιδιο invariant pattern με τα προηγουμενα 4 slices.

Αλλαγες (`apps/landing/app/page.tsx`, 2 σημεια, ιδιο αρχειο με παντα):
1. FAQ fix: το ιδιο question/anchor id αμεταβλητο — νεο answer προσθεσε "item, and statement" στη λιστα
   forms, δυο νεες προτασεις (Items: "purchased, current, and target prices together... one consistent
   figure instead of a euro number quietly standing in for dollars"· Statements: "converts as a whole
   document too: the total, minimum payment, and every individual charge, since installment payoff
   figures are summed from those same charges"), και το κλεισιμο εγινε "It now covers every money-holding
   record in the app: expenses, income, receipts, subscriptions, items, and statements." (αντι
   "...statements are still base-currency only for now" — δεν υπαρχει πλεον κανενα εκκρεμες record type
   να αναφερθει, οποτε το wording αλλαξε απο "covers X, Y still pending" σε "covers everything").
2. Roadmap fix: "Opt-in multi-currency for expenses, income, receipts & subscriptions" -> "Opt-in
   multi-currency for expenses, income, receipts, subscriptions, items & statements" στο Shipped block.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` επιβεβαιωσε: `found:true`, νεο FAQ text περιεχει "item, and statement forms" ΚΑΙ
  "expenses, income, receipts, subscriptions, items, and statements" (hasNewFaq:true), roadmap
  hasNewRoadmap:true / hasOldRoadmap:false. Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav,
  τριπλο badge row). `pkill -f "next start -p 3110"` -> επιβεβαιωθηκε οτι κανενα `next-server` process δεν
  εμεινε.
- em-dash: 0 σε ολο το page.tsx.
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only Read (χωρις subagent, μικρο
  scope), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: P9 ολοκληρωθηκε (ολα τα 6 record types πλεον στο landing wording· μονο imports/rate-feed
εκκρεμουν στο backlog, εκτος landing scope μεχρι να γινει user-facing feature). Candidates: P22 receipt
line-item global search, P21 document/manual vault, ή νεος `git log --oneline 2e408ff..HEAD | grep "feat("`
ελεγχος στην αρχη του επομενου run, ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-26 — P9 slice 6: bank CSV import multi-currency (last write path closed)

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (12 OPEN
entries πλεον, ολα bakecore + το pharos-daily-dev mobile-camera question, τιποτα ANSWERED προς αυτη τη
routine).

`git log --oneline 2e408ff..HEAD | grep "feat("` (2e408ff = τελευταιο source commit που αντικατοπτριστηκε
στο landing, βλ. entry #17) εβγαλε ενα φρεσκο: `901d7d0 feat(money): multi-currency for the bank CSV
import (P9 slice 6)`.

Read-only research (commit message, χωρις subagent, μικρο scope): το CSV importer (PA1, το ηδη-υπαρχον FAQ
"Can I bulk-import expenses from a bank export?") δεν ειχε καμια εννοια νομισματος, μια γραμμη Revolut/Wise
"88.00 USD" ειτε απορριπτονταν ειτε το USD πεταγονταν και τα 88 μπαιναν σαν ευρω. Το commit message το λεει
ρητα: αυτο ηταν "the last write path that could still create a record with a foreign amount stored as base
currency" (το email-in path ηδη καλυπτεται απο slice 2 μεσω του receipt AI parse). Behavior: νεο `currency`
CsvField + header hints σε 5 γλωσσες, sniff του code/symbol απο το ιδιο το amount cell οταν δεν υπαρχει
ξεχωριστη στηλη, `fxRates` = ΕΝΑ rate ανα νομισμα για ολοκληρο το αρχειο (οχι ανα γραμμη, γιατι μια τραπεζα
τυπωνει codes αλλα ποτε rates), και γραμμες χωρις rate ΔΕΝ χανονται/μαντευονται 1:1 αλλα μπαινουν με το
τυπωμενο ποσο+code + μετρωνται στο νεο `needsRate` πεδιο. Side-fix: το dedupe key ελεγχε το τυπωμενο ποσο
του CSV εναντια στο ΗΔΗ-converted stored ποσο, άρα re-import του ιδιου foreign αρχειου θα δημιουργουσε
duplicates· τωρα και οι δυο πλευρες κλειδωνουν στο τυπωμενο νουμερο (origAmount οταν υπαρχει).

Αλλαγες (`apps/landing/app/page.tsx`, 3 σημεια, ιδιο αρχειο με παντα):
1. CSV-import FAQ (`faq-can-i-bulk-import-expenses-from-a-bank-export`, anchor αμεταβλητο): προσθεσε
   τελευταια προταση για multi-currency behavior (currency column ή sniff απο το amount cell, ΕΝΑ rate ανα
   νομισμα για ολο το αρχειο στο preview, unrated γραμμη εισαγεται με το printed ποσο+code + μετραγεται στο
   result panel, οχι σιωπηλη προσθεση σε base-currency totals).
2. Multi-currency FAQ (`faq-can-it-handle-an-expense-in-a-currency-other-than-my-main-one`): το κλεισιμο
   αλλαξε απο "It now covers every money-holding record in the app: expenses, income, receipts,
   subscriptions, items, and statements." σε "...every money-holding record in the app and every way it
   gets in: expenses, income, receipts, subscriptions, items, and statements typed in or scanned, plus
   foreign-currency rows in a bank CSV import." (η διακριση "record types" vs "write paths" ειναι σκοπιμη,
   το CSV import δεν ειναι νεος τυπος εγγραφης, ειναι το τελευταιο σημειο εισαγωγης που καλυφθηκε).
3. Roadmap Shipped block: "...items & statements" -> "...items, statements & CSV imports".

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build
  (το standalone-output warning ειναι γνωστο/αβλαβες, ο server σερβιρει κανονικα).
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` επιβεβαιωσε και τα δυο FAQ ids found:true, το CSV FAQ περιεχει "Revolut or Wise export
  mixing EUR and USD rows is read correctly", το multi-currency FAQ περιεχει "foreign-currency rows in a
  bank CSV import", roadmap νεο wording παρον / παλιο wording απουσιαζει (και τα 3 checks true/false οπως
  αναμενοταν). Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav, τριπλο badge row). Server
  τερματιστηκε (`pkill -f "next start -p 3110"`), κανενα `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx.
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only Read/git-show (χωρις subagent,
  μικρο scope), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: P9 (record types + write paths) πλεον πληρως καλυμμενο στο landing wording. Candidates:
P22 receipt line-item global search, P21 document/manual vault, ή νεος
`git log --oneline 901d7d0..HEAD | grep "feat("` ελεγχος στην αρχη του επομενου run, ή polish συνεχεια /
real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-26 (2) — P9 slice 7: FX audit panel (missing-rate finder)

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (ιδιο
συνολο OPEN entries με το προηγουμενο run, ολα bakecore + το pharos-daily-dev mobile-camera question,
τιποτα ANSWERED προς αυτη τη routine).

`git log --oneline 901d7d0..HEAD | grep "feat("` (901d7d0 = τελευταιο commit που αντικατοπτριστηκε στο
landing, βλ. προηγουμενο entry) εβγαλε ενα φρεσκο: `84f7b7f feat(money): find the foreign entries still
missing an FX rate (P9 slice 7)`.

Read-only research (commit message, χωρις subagent, μικρο scope): το `resolveFx` ηδη δεν μαντευει ποτε
1:1 rate, οποτε ενα foreign record χωρις rate κραταει το τυπωμενο νουμερο στο `amount` και μπαινει σιωπηλα
σε καθε base-currency αθροισμα· μεχρι τωρα το μονο ιχνος ηταν το gold FxBadge πανω στο ιδιο το record, αρα
επρεπε να ξερεις ηδη ποιο να ανοιξεις, και ενα CSV import μπορει να δημιουργησει δεκαδες μαζι (ο importer
τα μετραει, αλλα ο αριθμος χανεται μετα). Νεο `needsFxRate()` (lib/fx.ts, το ιδιο FxBadge το διαβαζει τωρα
κι αυτο) + νεο `lib/fxAudit.ts` που λισταρει καθε τετοιο record σε 6 μοντελα (expenses/income/receipts/
items/subscriptions/statements)· expenses+income ειναι ενα μοντελο σε δυο routes, ενα item ανοιγει σε
/items ή /shopping αναλογα αν ειναι owned, αρα χρειαστηκε routing logic, οχι σκετο link. Το `/reports`
δειχνει τη λιστα ΠΑΝΩ απο τα νουμερα που στρεβλωνει (μεγαλυτερο τυπωμενο ποσο πρωτο), καθε γραμμη
deep-link στη φορμα του record· queried ΜΟΝΟ οταν το multi-currency ειναι on, αρα μηδεν κοστος σε
single-currency deployment.

Αλλαγες (`apps/landing/app/page.tsx`, 1 σημειο, ιδιο αρχειο με παντα): στην ηδη-υπαρχουσα multi-currency
FAQ (`"Can it handle an expense in a currency other than my main one?"`, anchor αμεταβλητο), προσθηκη μιας
προτασης αμεσως μετα το ηδη-υπαρχον "gold badge" wording: "...and Reports keeps a running list of every
record still missing one, largest printed amount first, each row linking straight to that record so a CSV
import that left a dozen unrated rows behind does not send you hunting for gold badges one page at a
time." Το roadmap Shipped item ΔΕΝ αλλαξε (ηδη λεει "Opt-in multi-currency for expenses, income, receipts,
subscriptions, items, statements & CSV imports" — το audit panel ειναι refinement πανω στο ιδιο feature,
οχι νεος τυπος record ή write path).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` (μεσω `document.body.textContent`, οχι `innerText` γιατι το FAQ answer ειναι
  collapsed/hidden by default) επιβεβαιωσε `found:true` για το νεο "keeps a running list of every record
  still missing one" ΚΑΙ `hasCsv:true` για το ηδη-υπαρχον "foreign-currency rows in a bank CSV import"
  (γειτονικο, δεν κοπηκε κατα λαθος). Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav,
  τριπλο badge row). `pkill -f "next start -p 3110"` -> επιβεβαιωθηκε οτι κανενα `next-server` process δεν
  εμεινε.
- em-dash: 0 σε ολο το page.tsx (`grep -c` UTF-8 byte pattern).
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only `git show --stat`/commit-message
  read (χωρις subagent, μικρο scope), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: νεος `git log --oneline 84f7b7f..HEAD | grep "feat("` ελεγχος στην αρχη του επομενου
run. Αλλιως candidates απο τη λιστα προτεραιοτητας: P22 receipt line-item global search, P21 document/
manual vault, ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-26 (3) — P9 slice 8: bills / payables multi-currency

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (ιδιο
συνολο OPEN entries, ολα bakecore + το pharos-daily-dev mobile-camera question, τιποτα ANSWERED προς αυτη
τη routine).

`git log --oneline 84f7b7f..HEAD | grep "feat("` (84f7b7f = τελευταιο commit που αντικατοπτριστηκε στο
landing, βλ. προηγουμενο entry) εβγαλε δυο: `9721d4c feat(landing): document FX audit panel...` (το ιδιο
το προηγουμενο commit αυτης της routine, ηδη reflected) και ενα φρεσκο:
`1ce991f feat(bills): multi-currency for bills / payables (P9 slice 8)`.

Read-only research (commit message + `git show --stat`, χωρις subagent, μικρο scope): το `Bill.amount` ηταν
το τελευταιο money field στην εφαρμογη χωρις το P9 currency triple (amount/origAmount/fxRate), αρα ενα
λογαριασμο τυπωμενο σε USD επρεπε να μπει σαν να ηταν ευρω. Τωρα ακολουθει τον ιδιο κανονα με τα αλλα εξι
μοντελα. Δυο σημεια δεν ηταν cosmetic: (1) mark-as-paid με expense logging περναει στο `addExpense` το
ΤΥΠΩΜΕΝΟ ποσο + νομισμα + rate (οχι το ηδη-converted), γιατι το addExpense κανει το δικο του resolveFx, αρα
περναγε το converted θα διπλασιαζε το rate· (2) ενα recurring bill's spawned next instance κληρονομει ολο
το triple, σκοπιμα κραταει το τελευταιο γνωστο rate (base-denominated projection αντι για rate-less foreign
row στο audit καθε κυκλο). Τα bills μπηκαν επισης στο FX audit (/reports) → το /bills χρειαστηκε το `?open=`
convention που εχουν ηδη ολα τα αλλα money views.

Αλλαγες (`apps/landing/app/page.tsx`, 2 σημεια, ιδιο αρχειο με παντα):
1. Multi-currency FAQ (`faq-can-it-handle-an-expense-in-a-currency-other-than-my-main-one`, anchor
   αμεταβλητο): νεα προταση μετα το statement wording, πριν το "Reports, budgets, and net worth" κλεισιμο,
   που περιγραφει το bill-specific wiring (mark-paid → expense περναει το printed figure ωστε να μη
   converts δυο φορες· recurring bill's next instance κραταει το τελευταιο rate). Το τελικο κλεισιμο
   `"...expenses, income, receipts, subscriptions, items, and statements typed in or scanned..."` →
   `"...expenses, income, receipts, subscriptions, items, statements, and bills typed in or scanned..."`.
2. Roadmap Shipped block: `"...items, statements & CSV imports"` → `"...items, statements, bills & CSV
   imports"`.

Δεν αγγιξα το ηδη-υπαρχον bills FAQ ("Does it track bills I pay by hand, like utilities?", γραμμη 509) γιατι
αφορα το tracking-mechanism (due-soon/overdue/paid triage), οχι νομισμα· το multi-currency wording ανηκει
στο dedicated multi-currency FAQ οπου ζουν ηδη ολα τα αλλα per-record-type sentences, ιδιο pattern με τα
προηγουμενα 7 slices.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` (μεσω `document.body.textContent`) επιβεβαιωσε και τα 3 checks true: το νεο bill
  wiring sentence, το νεο κλεισιμο με "statements, and bills typed in or scanned", και το roadmap
  "items, statements, bills & CSV imports". Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav,
  τριπλο badge row). Server τερματιστηκε (`pkill -f "next start -p 3110"`), κανενα `next-server` process
  δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx (`grep -c` UTF-8 byte pattern).
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only `git show --stat`/commit-message
  read (χωρις subagent, μικρο scope), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: P9 (record types + write paths, ολα 7 μοντελα + CSV import) πλεον πληρως καλυμμενο στο
landing wording. Candidates: νεος `git log --oneline 1ce991f..HEAD | grep "feat("` ελεγχος στην αρχη του
επομενου run, P22 receipt line-item global search, P21 document/manual vault, ή polish συνεχεια / real app
screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-26 (4) — P9 slice 9: FX audit panel goes in-place (bulk apply by currency)

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` ελεγχθηκε (ιδιο
συνολο OPEN entries με τα προηγουμενα runs, ολα bakecore + το pharos-daily-dev mobile-camera question,
τιποτα ANSWERED προς αυτη τη routine).

`git log --oneline 1ce991f..HEAD | grep "feat("` (1ce991f = τελευταιο commit που αντικατοπτριστηκε στο
landing, βλ. προηγουμενο entry) εβγαλε δυο: `c22c144 feat(landing): document bills multi-currency...` (το
ιδιο το προηγουμενο commit αυτης της routine, ηδη reflected) και ενα φρεσκο: `cbde1a8 feat(reports): set a
missing FX rate in place, per currency or per record (P9 slice 9)`. (Το `3135e3f docs(features+mobile)...`
και το `d33a78d docs(progress)...` ειναι απο αλλη routine, docs/FEATURES.md + docs/DOCS_PROGRESS.md, οχι
landing, δεν μετρανε.)

Read-only research (commit message + `git show --stat`, χωρις subagent, μικρο scope): το audit panel του
slice 7 (ηδη documented στο landing) εβρισκε καθε ξενη εγγραφη χωρις ισοτιμια αλλα εστελνε τον χρηστη σε
εξι διαφορετικες φορμες για να τη διορθωσει, ενα row-link ανα φορα, που ηταν και ο λογος που εμεναν
αδιορθωτες σε πρακτικη χρηση. Το slice 9 βαζει το fix επι τοπου μεσα στο ιδιο το Reports panel: ομαδοποιηση
ανα τυπωμενο νομισμα (USD/EUR/GBP/...) με ενα "Apply to all N" bulk κουμπι ανα ομαδα, plus per-record
override για εξαιρεσεις, plus live preview του converted ποσου πριν αποθηκευτει τιποτα. Νεο pure
`lib/fxApply.ts` κρατα σε ενα μερος ποια πεδια μετατρεπονται ανα module (καθρεφτιζοντας τον resolver
του καθενος: receipt net/VAT/γραμμες, item και τις 3 τιμες, statement minimum/paid/χρεωσεις, subscription
first charge), γραφοντας με dotted paths ωστε να μη χαθουν installment info/product links/ονοματα γραμμων.

Αλλαγη (`apps/landing/app/page.tsx`, 1 σημειο, ιδιο αρχειο με παντα): στην ηδη-υπαρχουσα multi-currency
FAQ (`faq-can-it-handle-an-expense-in-a-currency-other-than-my-main-one`, anchor αμεταβλητο), η προταση
απο το slice-7 entry ("...largest printed amount first, each row linking straight to that record so a CSV
import that left a dozen unrated rows behind does not send you hunting for gold badges one page at a
time.") αντικατασταθηκε πληρως ωστε να περιγραφει το νεο in-place mechanism: "...grouped by the currency
printed on it: set a rate once and \"Apply to all\" fills every record in that group, or override a single
one, with a live preview of the converted amount before anything is stored. That turns a CSV import that
left a dozen unrated rows behind into one fix in Reports instead of hunting down gold badges page by
page." Το κλεισιμο της FAQ ("It now covers every money-holding record...") και το roadmap Shipped block
δεν αλλαξαν (το slice 9 ειναι refinement πανω στο ηδη-documented audit feature, οχι νεος τυπος record ή
write path).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build
  (το standalone-output warning ειναι γνωστο/αβλαβες, ο server σερβιρει κανονικα).
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` (μεσω `document.body.textContent`) επιβεβαιωσε και τα 3 checks: νεο wording ("grouped
  by the currency printed on it" + "\"Apply to all\" fills every record" + "one fix in Reports instead of
  hunting down gold badges page by page") παρον, παλιο wording ("does not send you hunting for gold badges
  one page at a time") απουσιαζει, γειτονικο CSV wording αμεταβλητο και παρον. Hero screenshot καθαρο
  (lighthouse mark, gradient τιτλος, nav, τριπλο badge row). Server τερματιστηκε (`pkill -f "next start -p
  3110"`), κανενα `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx (`grep -c` UTF-8 byte pattern).
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only `git show --stat`/commit-message
  read (χωρις subagent, μικρο scope), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: νεος `git log --oneline cbde1a8..HEAD | grep "feat("` ελεγχος στην αρχη του επομενου
run. Αλλιως candidates απο τη λιστα προτεραιοτητας: P22 receipt line-item global search, P21 document/
manual vault, ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-26 (5) — P9 slice 10: product URL import honours the page's own currency

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` (81 γραμμες)
ελεγχθηκε, καμια καταχωρηση αφορα τη landing routine (ολα bakecore + pharos-daily-dev mobile-camera),
τιποτα ANSWERED προς αυτη τη routine.

`git log --oneline cbde1a8..HEAD | grep "feat("` (cbde1a8 = τελευταιο commit που αντικατοπτριστηκε στο
landing, βλ. προηγουμενο entry) εβγαλε δυο: `039e093 feat(landing): document the FX audit panel's...`
(το ιδιο το προηγουμενο commit αυτης της routine, ηδη reflected) και ενα φρεσκο: `7e4e62b feat(items): a
product page's own currency reaches the imported item (P9 slice 10)`.

Read-only research (commit message + `git show --stat`, χωρις subagent, μικρο scope): το προϊον URL import
ητανε το τελευταιο write path που μπορουσε ακομα να μετατρεψει μια ξενη τιμη σε βασικο νομισμα σιωπηλα.
Το `ParsedProductSchema` ειχε ηδη `currency` πεδιο αλλα κανενα call site δεν το διαβαζε, αρα ενα προϊον
$1,299 αποθηκευονταν σαν να ηταν 1,299 του νομισματος του deployment. Η νεα `extractPriceCurrency()`
διαβαζει schema.org `priceCurrency`, `og:`/`product:price:currency` και `itemprop` markup απο την ιδια
τη σελιδα, και μονο πεφτει πισω στο ο,τι ειδε τυπωμενο το μοντελο σαν τελευταια λυση· ενα γυμνο "$" ΔΕΝ
resolve-εται μονο του (USD σε ενα shop, CAD/AUD σε αλλο) — το P9 δεν επινοει δεδομενα νομισματος, αρα μια
σελιδα που δεν δηλωνει τιποτα συμπεριφερεται ακριβως οπως πριν. Ενα ΝΕΟ item υιοθετει αυτο το νομισμα (μεσω
`resolveItemPrices`), η τυπωμενη τιμη αποθηκευεται με `fxRate 0` και εμφανιζεται στο ηδη-existing Reports
"needs an exchange rate" panel. Ενα ΗΔΗ-υπαρχον item κρατα το δικο του νομισμα: το store link καταγραφεται
αλλα μια ασυμβατη τιμη μενει εξω (ενα item κραταει ενα rate για ολες τις τιμες του) και το αποτελεσμα
αναφερει ποιο νομισμα παραλειφθηκε. Ιδιος κανονας σε `importItemFromUrl`, `confirmImportItem` και το price
refresh του `aiFillItem`.

Αλλαγη (`apps/landing/app/page.tsx`, 1 σημειο, ιδιο αρχειο με παντα): στην ηδη-υπαρχουσα multi-currency FAQ
(`Can it handle an expense in a currency other than my main one?`), νεα προταση μπηκε αμεσως μετα το ηδη-
υπαρχον item wording ("...net worth and the insurance export see one consistent figure instead of a euro
number quietly standing in for dollars.") και πριν το statement closing ("A card statement converts as a
whole document too:"), που περιγραφει το νεο page-sourced currency detection για product URL import: πως
διαβαζεται πρωτα το schema.org/OG markup (οχι μαντεψια απο γυμνο "$"), πως ενα νεο item υιοθετει τη σελιδας
νομισμα και μπαινει στο ιδιο missing-rate list, και πως ενα ηδη-υπαρχον item κρατα το δικο του (ασυμβατη
τιμη καταγραφεται σαν link αλλα μενει εξω απο το price history μεχρι να ρυθμιστει, με το αποτελεσμα να λεει
ποιο νομισμα παραλειφθηκε). Το κλεισιμο της FAQ και το roadmap Shipped block ΔΕΝ αλλαξαν (refinement πανω
στο ηδη-documented item multi-currency behaviour, οχι νεος τυπος record ή write path, ιδιο pattern με τα
slices 7 και 9).

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` (μεσω `document.body.textContent`) επιβεβαιωσε και τα 5 checks true: το νεο "Paste a
  product link to import or price-check an item..." wording, "only what the model saw printed is used as
  a fallback", "the result tells you which currency it skipped", plus τα δυο γειτονικα προτασεις (item
  abroad + card statement) αμεταβλητα και παρoντα εκατερωθεν. Hero screenshot καθαρο (lighthouse mark,
  gradient τιτλος, nav, τριπλο badge row). Server τερματιστηκε (`pkill -f "next start -p 3110"`), κανενα
  `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx (`grep -c` UTF-8 byte pattern).
- Δεν αγγιξα Docker/:3000/web/mobile. Η μονη agent-χρηση ηταν read-only `git show --stat`/commit-message
  read (χωρις subagent, μικρο scope), μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: P9 (record types + write paths) πλεον πληρως καλυμμενο (10/10 slices, ολα 7 μοντελα +
CSV import + URL import) στο landing wording. Candidates: νεος `git log --oneline 7e4e62b..HEAD | grep
"feat("` ελεγχος στην αρχη του επομενου run, P22 receipt line-item global search, P21 document/manual
vault, ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).

## 2026-07-26 (6) — P21 item document/manual vault gets its own FAQ

Coordination guard: `~/.claude/ROUTINES_PAUSED` δεν υπαρχει. `~/.claude/ASK_ACHILLEAS.md` (146 γραμμες)
ελεγχθηκε, καμια καταχωρηση αφορα τη landing routine (ολα bakecore + pharos-daily-dev mobile-camera),
τιποτα ANSWERED προς αυτη τη routine.

`git log --oneline 7e4e62b..HEAD | grep "feat("` (7e4e62b = τελευταιο commit που αντικατοπτριστηκε στο
landing, βλ. προηγουμενο entry) εβγαλε δυο: `cd594d9 feat(landing): document product URL import's...`
(το ιδιο το προηγουμενο commit αυτης της routine, ηδη reflected) και `8be7040 feat(mobile): foreign-currency
expenses from the phone (P9)`.

Read-only research (commit message, χωρις subagent): το `8be7040` φερνει το mobile API v1 expenses/income
route σε parity με το ηδη-documented web multi-currency behaviour (η landing FAQ ηδη ελεγε "the expense,
income, receipt, subscription, item, and statement forms grow a currency picker" γενικα, χωρις να διακρινει
web απο mobile) plus ενα display-bug fix (list/header χρησιμοποιουσαν `rows[0].currency` αντι για base
currency). Δεδομενου οτι η υπαρχουσα multi-currency FAQ ηδη καλυπτει expenses/income χωρις platform
διακριση, δεν βρηκα νεο user-facing ισχυρισμο που να αξιζει νεα προταση εκει· θα ηταν αναδιατυπωση χωρις
νεο περιεχομενο.

Αντ' αυτου διαλεξα ενα ηδη-shipped αλλα ΑΤΕΚΜΗΡΙΩΤΟ feature απο τη λιστα υποψηφιων του προηγουμενου entry:
**P21, το per-item document/manual vault** (`ab2687e feat(mobile): item document/manual vault, read-only
(P21 mobile parity)`, mobile πλευρα· η ιδια η web λειτουργια ηταν ηδη shipped νωριτερα, `apps/web/src/app/
items/ItemDocuments.tsx`). Διαβασα το `ItemDocuments.tsx` (upload/rename via re-upload/delete, οποιοδηποτε
file type, ξεχωριστο απο το photo gallery) + το commit του mobile parity (read-only Documents section στο
item detail, mirroring Photos/Links, non-image files → explanatory alert αντι για broken tap-open). Η
landing FAQ ανεφερε ηδη εμμεσα τα "photos, manuals, and linked receipts" μεσα στο insurance-export bundle
(γραμμη 541-542, αμεταβλητη) αλλα ΔΕΝ υπηρχε καμια FAQ που να εξηγει το ιδιο το vault feature (upload
manual/warranty PDF σε ενα item) πριν φτασει στο export.

Αλλαγη (`apps/landing/app/page.tsx`, νεα FAQ εγγραφη, εισηχθηκε αμεσως ΠΡΙΝ την ηδη-υπαρχουσα "Can it
produce an export for an insurance claim?" ωστε η σειρα να ακολουθει τη φυσικη ροη, vault πρωτα, export
που το χρησιμοποιει μετα): "Can I keep a manual or warranty PDF with an item?" / "Yes. Every item has a
document vault, separate from its photo gallery, for anything you would otherwise lose in a downloads
folder: a manual, a warranty certificate, a scanned serial-number sticker, in any file type. Upload,
rename, and delete as the pile grows. It shows up read-only on the mobile app too, so you can pull up a
manual standing in front of the thing it belongs to. The insurance export below bundles this vault
straight into its ZIP." Η υπαρχουσα insurance-export FAQ δεν αλλαξε.

Verify:
- `npm run type-check` -> exit 0.
- `npm run build` -> success (13 static routes, αμεταβλητο, `/` route 5.35 kB, μηδεν bundle αλλαγη).
- Πορτες 3100-3130: μονο το 3100 κατειλημμενο (Docker). `next start -p 3110` πανω στο production build.
  `mcp__Claude_Browser__*` διαθεσιμο· `read_console_messages` (onlyErrors) -> "No console logs." καθαρο.
  `javascript_tool` (μεσω `document.body.textContent`) επιβεβαιωσε ολα τα checks true: νεα ερωτηση παρουσα,
  νεο σωμα ("a manual, a warranty certificate, a scanned serial-number sticker") παρον, το mobile-mention
  ("It shows up read-only on the mobile app too") παρον, η γειτονικη insurance-export FAQ αμεταβλητη και
  παρουσα. Hero screenshot καθαρο (lighthouse mark, gradient τιτλος, nav, τριπλο badge row). Server
  τερματιστηκε (`pkill -f "next start -p 3110"`), κανενα `next-server` process δεν εμεινε.
- em-dash: 0 σε ολο το page.tsx (`grep -c` UTF-8 byte pattern).
- Δεν αγγιξα Docker/:3000/web/mobile. Μηδεν subagent, μηδεν AI call για copy generation.
- Collision guard: `git status --short` πριν το add εδειξε ΜΟΝΟ `apps/landing/app/page.tsx` modified,
  κανενα ξενο staged file.

Επομενο increment: νεος `git log --oneline 8be7040..HEAD | grep "feat("` ελεγχος στην αρχη του επομενου
run. Αλλιως candidates: P22 receipt line-item search subtitle (μικρη προσθηκη στην ηδη-υπαρχουσα AI-command-
bar/global-search FAQ, γραμμη ~458, οτι ενα query που ταιριαζει σε line-item αντι για store δειχνει ποιο
προϊον ταιριαξε), ή polish συνεχεια / real app screenshots οταν υπαρξουν assets (blocked).

Needs-Achilleas (open, αμεταβλητα): ιδια με προηγουμενα entries (legal entity/Stripe, Terms+Privacy review,
contact inbox + hosted τιμες, repo public timing).
