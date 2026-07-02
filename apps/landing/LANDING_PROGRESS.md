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
