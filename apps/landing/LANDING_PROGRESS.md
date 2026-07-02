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
