import { PharosMark } from './components/PharosMark';
import { Icon } from './components/Icon';
import { MobileNav } from './components/MobileNav';
import { ScrollSpy } from './components/ScrollSpy';
import { ScrollProgress } from './components/ScrollProgress';
import { BackToTop } from './components/BackToTop';
import { CopyButton } from './components/CopyButton';
import { FaqDeepLink } from './components/FaqDeepLink';
import { FaqCopyLink } from './components/FaqCopyLink';
import { Pricing } from './components/Pricing';

const GITHUB_URL = 'https://github.com/achilleasgkekas/pharos';

// Where "Sign in" goes. The marketing site had no way into the product at all: a returning
// customer landed on ph-aros.com and had to already know the app lives on another
// subdomain. Env-overridable so a staging landing can point at a staging app.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.ph-aros.com';
const SITE_URL = 'https://ph-aros.com';

// The repository is private during the private-beta phase and goes public right
// before launch. While false, self-host CTAs carry a "coming soon" signal so
// visitors are not surprised by a 404. Flip to true the moment the repo is
// public and every badge/note below disappears automatically.
const REPO_PUBLIC = false;

// Hosted signup is closed while the beta is private: `SAAS_SIGNUP_CODES` is set on the
// production app, so /account/signup asks for an invite code and creates nothing without
// one (verified on the live form, 2026-08-05). Until this flips, every hosted CTA says so
// rather than sending a visitor to a door that will not open. Flip to false the day the
// codes come off and each note below disappears on its own.
const HOSTED_INVITE_ONLY = true;

/** Where a human writes to. Same address the privacy and terms pages give. */
const CONTACT_EMAIL = 'hello@ph-aros.com';

// Raw quickstart commands, kept in sync with the colour-tokenised <pre> below.
// Used by the copy-to-clipboard button so the copied text has no markup.
const QUICKSTART_COMMANDS = [
  '# Pull and start the stack',
  `git clone ${GITHUB_URL}.git`,
  'cd pharos',
  'cp .env.example .env   # set your secrets',
  'docker compose up -d',
  '',
  '# Open http://localhost:3000',
].join('\n');

const FEATURES: {
  icon: string;
  color: string;
  title: string;
  desc: string;
}[] = [
  {
    icon: 'package',
    color: 'var(--accent)',
    title: 'Inventory & shopping',
    desc: 'Track everything you own and everything you want. Multi-store price tracking, deal alerts, warranties, and a wishlist that watches for drops.',
  },
  {
    icon: 'receipt',
    color: 'var(--cyan)',
    title: 'Receipts, read by AI',
    desc: 'Drop a photo or PDF and AI pulls out the store, date, totals, and line items in any language. Quick-verify queue to clear the backlog fast.',
  },
  {
    icon: 'wallet',
    color: 'var(--gold)',
    title: 'Expenses & income',
    desc: 'Bills and payslips scanned, recurring series auto-detected, anomaly flags when a vendor charges more than usual. Budgets per category, with optional envelope rollover so an unspent month carries forward.',
  },
  {
    icon: 'card',
    color: 'var(--purple)',
    title: 'Statements & installments',
    desc: 'Import credit-card PDFs, parse installment plans, and merge the same purchase across months. Reconcile charges against your receipts, and always know what you still owe.',
  },
  {
    icon: 'calendar',
    color: 'var(--accent)',
    title: 'Subscriptions',
    desc: 'Every recurring charge in one place with a renewal calendar, plus free-trial reminders that ping you to cancel before the first charge lands. It also scans your expense history for regular charges you never tracked and lets you add them as a subscription in one click.',
  },
  {
    icon: 'ticket',
    color: 'var(--red)',
    title: 'Vouchers & coupons',
    desc: 'Store gift cards and discount codes, track the balance left on each one, and get expiry reminders before value slips away. Loyalty and membership cards work too, tap one to show a scannable barcode at checkout. Add them by hand or let AI read them from a screenshot.',
  },
  {
    icon: 'chart',
    color: 'var(--cyan)',
    title: 'Reports',
    desc: 'Cash flow, spend by store and category, net position, and price history charts, plus a forward safe-to-spend view that projects what is left after upcoming bills. A zero-AI Month in Review digest opens the page with a one-sentence summary of what changed. See where the money actually goes.',
  },
  {
    icon: 'kanban',
    color: 'var(--purple)',
    title: 'Tasks & planning',
    desc: 'A Kanban board (Todo, In-Progress, Blocked, Done) plus a list view. Quick-add with #tag parsing, drag-and-drop or arrow-key moves between columns, and a per-project progress bar when you filter by tag. Turn any inventory or shopping item straight into a task.',
  },
];

const DEPLOY_TARGETS: string[] = [
  'Docker Compose',
  'Proxmox LXC',
  'Any Linux VM',
  'Raspberry Pi (ARM64)',
  'Synology / NAS',
  'Bare metal',
];

const STEPS: { title: string; desc: string }[] = [
  {
    title: 'Clone & configure',
    desc: 'Grab the repo, copy the env template, and set your secrets. Bring your own AI key or point it at a local Ollama.',
  },
  {
    title: 'docker compose up',
    desc: 'One command starts the web app, MongoDB, and SearXNG. No external services, no telemetry, nothing phones home.',
  },
  {
    title: 'Open the dashboard',
    desc: 'Reach it on your LAN or over your own VPN. Add receipts, items, and statements, and let the AI do the parsing.',
  },
];

// Honest tech stack for the audit-minded self-host audience. No mystery box.
const STACK: { name: string; detail: string; color: string }[] = [
  { name: 'Next.js 15', detail: 'App Router, React Server Components, server actions, TypeScript strict.', color: 'var(--accent)' },
  { name: 'MongoDB 7', detail: 'Mongoose 8 ODM, soft-delete trash, time-series price history.', color: 'var(--cyan)' },
  { name: 'Docker Compose', detail: 'Web, database, and search in one command. Nothing external required.', color: 'var(--purple)' },
  { name: 'Tailwind CSS v4', detail: 'Dark-first design system, mobile-first, tuned for use over VPN.', color: 'var(--gold)' },
  { name: 'Zod', detail: 'One schema validates the same data on the server and the client.', color: 'var(--red)' },
  { name: 'SearXNG', detail: 'A self-hosted metasearch node powers price and product enrichment.', color: 'var(--accent)' },
  { name: 'Your AI, your call', detail: 'Local Ollama for full privacy, or Anthropic, OpenAI, Gemini, OpenRouter, or any OpenAI-compatible custom endpoint.', color: 'var(--cyan)' },
  { name: 'No public auth', detail: 'Login-gated, reached over your LAN or VPN. No sign-up, no telemetry.', color: 'var(--purple)' },
];

// Reassurance chips shown directly under the hero CTAs, reinforcing the core
// differentiators (open source, private, easy self-host) at the highest-attention spot.
const HERO_TRUST: { icon: string; color: string; label: string }[] = [
  { icon: 'code', color: 'var(--accent)', label: 'AGPL-3.0 open source' },
  { icon: 'eyeOff', color: 'var(--cyan)', label: 'No telemetry, ever' },
  { icon: 'server', color: 'var(--purple)', label: 'Self-host in minutes' },
];

const TRUST: { icon: string; color: string; title: string; desc: string }[] = [
  {
    icon: 'code',
    color: 'var(--accent)',
    title: 'Open source',
    desc: 'Every line is AGPL-3.0 on GitHub. Read it, fork it, audit it, run it forever.',
  },
  {
    icon: 'shield',
    color: 'var(--cyan)',
    title: 'Privacy-first',
    desc: 'Receipts and finances stay on your disk. Nothing is sold, shared, or mined.',
  },
  {
    icon: 'eyeOff',
    color: 'var(--purple)',
    title: 'Zero telemetry',
    desc: 'No trackers, no analytics beacons, no phone-home. The self-host build talks to nobody.',
  },
  {
    icon: 'server',
    color: 'var(--gold)',
    title: 'Local-first',
    desc: 'Self-hosted, files are served straight from your machine. Works fully offline, no cloud dependency.',
  },
  {
    icon: 'unlock',
    color: 'var(--red)',
    title: 'No lock-in',
    desc: 'One-click JSON export and import. Move between self-hosted and hosted whenever you like.',
  },
];

const PERSONAS: { icon: string; color: string; title: string; desc: string }[] = [
  {
    icon: 'server',
    color: 'var(--accent)',
    title: 'Homelabbers',
    desc: 'You already run Proxmox, a NAS, and a UniFi rack. Pharos is the one dashboard that ties your gear and your spend together, sitting self-hosted right beside everything else you own.',
  },
  {
    icon: 'receipt',
    color: 'var(--cyan)',
    title: 'Receipt & money trackers',
    desc: 'Shoeboxes of receipts, installments spread across cards, subscriptions you forgot you had. Drop it all in and let AI read, sort, and total it, so you always know exactly what you owe.',
  },
  {
    icon: 'shield',
    color: 'var(--purple)',
    title: 'Privacy-first owners',
    desc: 'Your financial life does not belong in someone else’s cloud. Run Pharos on your own hardware, fully offline, with zero telemetry, answering to nobody but you.',
  },
];

type Tier = {
  name: string;
  price: string;
  cadence?: string;
  // Numeric EUR amount for per-plan Offer JSON-LD ('0' = free). Omit for non-priced rows.
  amount?: string;
  tagline: string;
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  badge?: string;
  // True only for the free self-hosted row. Its availability tracks REPO_PUBLIC, while a
  // hosted plan is sign-up-then-activate: the account is free to create, and the plan itself
  // is switched on with an activation code (see the billing panel).
  selfHost?: boolean;
  features: string[];
};

// Hosted tiers mirror apps/web/src/lib/billing/plans.ts, the single source of truth
// for plan names, monthly EUR prices and quotas (storage, AI calls, seats, custom
// domain). Keep the two in sync: the backend is authoritative, this is its shop window.
// Decided 2026-08-03 (ASK_ACHILLEAS pharos-landing-20260729-1000, option b): there is
// NO permanent free hosted tier. "Free forever" is the self-hosted edition; hosted opens
// with a 14-day trial and is paid after it (matching provision.ts trialing -> suspended).
// The backend `free` plan is the plan a workspace sits on during that trial, not a
// product on this page, so it gets no pricing card of its own.
const TIERS: Tier[] = [
  {
    name: 'Self-hosted',
    price: 'Free',
    amount: '0',
    cadence: 'forever',
    tagline: 'Run it on your own hardware, forever. Open source, AGPL-3.0.',
    cta: 'Get the Docker image',
    ctaHref: GITHUB_URL,
    badge: 'AGPL-3.0',
    selfHost: true,
    features: [
      'Every module, no seat limits',
      'Your data stays on your machine',
      'Bring your own AI (Ollama, Anthropic, OpenAI, Gemini…)',
      'SMB / FTP / OneDrive backups',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    price: '€9',
    cadence: 'per month',
    amount: '9',
    tagline: 'The whole hub, managed for you, shared with up to 5 people.',
    cta: 'Get started',
    ctaHref: `${APP_URL}/account/signup?plan=shared`,
    highlight: true,
    badge: 'Most popular',
    features: [
      'Up to 5 members',
      '50 GB storage',
      '1,000 AI document reads per month',
      'Shared workspace with roles and invites',
      'Priority email support',
    ],
  },
  {
    name: 'Dedicated',
    price: '€29',
    cadence: 'per month',
    amount: '29',
    tagline: 'Your own isolated instance, unlimited seats, your own domain.',
    cta: 'Get started',
    ctaHref: `${APP_URL}/account/signup?plan=dedicated`,
    features: [
      'Everything in Pro',
      'Unlimited members',
      '500 GB storage',
      'Unlimited AI with your own key',
      'Custom domain on your instance',
    ],
  },
];

const SHOWCASE_STATS: { lbl: string; val: string; color: string }[] = [
  { lbl: 'Net position', val: '€12,708', color: 'var(--accent)' },
  { lbl: 'Owed · installments', val: '€1,149', color: 'var(--gold)' },
  { lbl: 'This month', val: '−€221', color: 'var(--cyan)' },
];

const SHOWCASE_MODS: { icon: string; color: string; title: string; count: string }[] = [
  { icon: 'package', color: 'var(--accent)', title: 'Inventory', count: '66 items' },
  { icon: 'receipt', color: 'var(--cyan)', title: 'Receipts', count: '240 scanned' },
  { icon: 'card', color: 'var(--purple)', title: 'Installments', count: '5 active plans' },
  { icon: 'calendar', color: 'var(--gold)', title: 'Subscriptions', count: 'next in 4d' },
  { icon: 'wallet', color: 'var(--red)', title: 'Expenses', count: '3 recurring' },
  { icon: 'ticket', color: 'var(--accent)', title: 'Vouchers', count: '2 expiring' },
  { icon: 'chart', color: 'var(--cyan)', title: 'Reports', count: '12-mo trend' },
  { icon: 'kanban', color: 'var(--gold)', title: 'Tasks', count: '9 open' },
];

// By-the-numbers proof band, every figure is factual and derivable from the app
const STATS: { num: string; lbl: string; color: string }[] = [
  { num: '8', lbl: 'Modules in one hub', color: 'var(--accent)' },
  { num: '6', lbl: 'AI providers, your pick', color: 'var(--cyan)' },
  { num: '4', lbl: 'Storage backends', color: 'var(--purple)' },
  { num: '0', lbl: 'Trackers or telemetry', color: 'var(--gold)' },
  { num: '∞', lbl: 'Yours to keep · AGPL-3.0', color: 'var(--red)' },
];

// Parsed output for the "AI in action" spotlight (CSS-drawn, no assets)
const AI_FIELDS: { k: string; v: string; color?: string }[] = [
  { k: 'Store', v: 'Πλαίσιο Computers' },
  { k: 'Date', v: '22 Nov 2023' },
  { k: 'VAT (24%)', v: '€28.94' },
  { k: 'Total', v: '€149.50', color: 'var(--accent)' },
];

const AI_LINES: { name: string; price: string }[] = [
  { name: 'Lenovo Tab M9 3GB', price: '€119.50' },
  { name: 'USB-C 65W charger', price: '€30.00' },
];

const AI_NOTES: { icon: string; label: string }[] = [
  { icon: 'receipt', label: 'Any language, any layout' },
  { icon: 'check', label: 'Line items, VAT & totals split out' },
  { icon: 'chart', label: 'Quick-verify queue clears the backlog' },
];

const INTEGRATIONS: { group: string; icon: string; color: string; items: string[] }[] = [
  {
    group: 'Storage & backup',
    icon: 'server',
    color: 'var(--accent)',
    items: ['Local disk', 'SMB / SMB3', 'FTP / FTPS', 'OneDrive', 'Nightly archive'],
  },
  {
    group: 'Bring your own AI',
    icon: 'code',
    color: 'var(--cyan)',
    items: ['Ollama (local)', 'Anthropic', 'OpenAI', 'Gemini', 'OpenRouter', 'Custom endpoint'],
  },
  {
    group: 'Import & export',
    icon: 'receipt',
    color: 'var(--purple)',
    items: ['Gmail export', 'PDF & image OCR', 'CSV export', 'JSON backup'],
  },
  {
    group: 'Alerts & automation',
    icon: 'bell',
    color: 'var(--gold)',
    items: ['ntfy push', 'Price-drop alerts', 'Budget alerts', 'Webhook automation'],
  },
];

const COMPARE: { label: string; self: string; hosted: string }[] = [
  { label: 'Where it runs', self: 'Your own hardware', hosted: 'Our managed servers' },
  { label: 'Your data', self: 'Stays on your disk', hosted: 'Isolated per tenant' },
  { label: 'Setup', self: 'One docker compose up', hosted: 'Nothing to install' },
  { label: 'Updates & backups', self: 'You run them', hosted: 'Nightly, restore-tested' },
  { label: 'AI parsing', self: 'Bring your own key or Ollama', hosted: 'Included, ready to go' },
  { label: 'Offline use', self: 'Full, no internet needed', hosted: 'Needs a connection' },
  { label: 'Cost', self: 'Free forever, AGPL-3.0', hosted: '14-day free trial, then €9/mo' },
  { label: 'Support', self: 'Community & docs', hosted: 'Priority email' },
];

const ROADMAP: {
  phase: string;
  color: string;
  note: string;
  items: string[];
}[] = [
  {
    phase: 'Shipped',
    color: 'var(--accent)',
    note: 'Live in the self-hosted app today',
    items: [
      'Inventory, shopping & multi-store price tracking',
      'AI receipt, expense & voucher scanning',
      'Card statements with installment plans',
      'Subscriptions, reports & a 3-month calendar with iCal feed',
      'SMB, FTP & OneDrive backups',
      'IMAP email-in, savings goals & insurance export bundle',
      'Eight-language interface localisation',
      'Return-window reminders for recent purchases',
      'Bring-your-own-key AI billing for hosted workspaces',
      'Opt-in multi-currency for expenses, income, receipts, subscriptions, items, statements, bills & CSV imports',
      'A browser bookmarklet and Chrome extension for one-click capture',
    ],
  },
  {
    phase: 'Building',
    color: 'var(--cyan)',
    note: 'In active development now',
    items: [
      'Managed multi-tenant hosted edition',
    ],
  },
  {
    phase: 'Exploring',
    color: 'var(--purple)',
    note: 'On the backlog, not yet scheduled',
    items: [
      'Open Banking bank-transaction sync (EU)',
    ],
  },
];

// Grouped so a reader can scan by topic instead of down a single 40-row list.
// Anchors are derived from the question text (see faqId), so regrouping or
// reordering never invalidates an existing deep link.
const FAQ_GROUPS: {
  title: string;
  note: string;
  items: { q: string; a: string }[];
}[] = [
  {
    title: 'Getting started',
    note: 'What PHAROS is, and what it takes to run',
    items: [
      {
        q: 'Can I sign up for the hosted version today?',
        a: 'Only with an invite. Hosted PHAROS is in a private beta, so the signup form asks for an invite code and creates nothing without one. Ask for a code at hello@ph-aros.com and say a little about what you would track, since the beta is deliberately small. Three things worth knowing. If someone inside a workspace has already invited you by email, open that invitation instead: the invite is itself the authorisation and needs no code, so an owner can always bring in a colleague. The code opens the door and nothing more, it does not put you on a paid plan, so you land on the same 14-day trial as everyone else. And the gate is checked before anything else the form could tell you, so a stranger cannot use signup to find out which email addresses are already registered. Self-hosting has no gate of this kind at all; it is only waiting on the public repo, which opens right before launch.',
      },
      {
        q: 'Is self-hosting really free?',
        a: 'Yes. The self-hosted edition is open source under AGPL-3.0 with every module and no seat limits. Run it on your own hardware for as long as you like. The only paid option is the managed hosting, where we run and maintain it for you.',
      },
      {
        q: 'What do I need to run it?',
        a: 'Docker and a machine that stays on: a Mac mini, a NAS, a Proxmox LXC, or a spare mini PC all work. One docker compose up brings up the web app, MongoDB, and search. Reach it over your LAN or your own VPN.',
      },
      {
        q: 'Can I see what it looks like before adding my own data?',
        a: 'Yes. Settings has a one-click "Load sample data" that fills items, receipts, expenses, and subscriptions with a small realistic set, dates spread over the last few months, so a brand-new install already looks lived-in. Every sample record is tagged behind the scenes, so "Clear sample data" removes exactly those and nothing you added yourself. Available on both self-hosted and hosted.',
      },
      {
        q: 'How do updates work?',
        a: 'Self-hosted updates are a git pull and one docker compose up, so you upgrade on your own schedule and can pin to a version you trust. On hosted we roll out updates for you, so you are always on the latest release with nothing to maintain.',
      },
      {
        q: 'Does it run on ARM, like a Raspberry Pi or an ARM instance?',
        a: 'Yes, and both architectures are built on purpose. Development happens on Apple Silicon, where a plain docker build produces an arm64-only image that would refuse to start, or crawl under emulation, on an x86 server, so the release image is built for linux/amd64 and linux/arm64 under one tag. The same tag runs on an x86 VPS, on an ARM cloud instance (often cheaper per core), and on a Raspberry Pi with 64-bit Linux, with no variant for you to pick. One thing worth planning for: AI parsing is the heavy part, so on a small board keep the app local and point AI at a cloud provider or at an Ollama running on a beefier machine on your LAN, which is a setting rather than a rebuild.',
      },
    ],
  },
  {
    title: 'Hosted or self-hosted',
    note: 'Choosing a path, and moving between them later',
    items: [
      {
        q: 'How is hosted different from self-hosted?',
        a: 'It is the same app. With hosted we handle the server, updates, and nightly backups, and AI parsing is included so there is nothing to configure. Self-hosted gives you full control and keeps every byte on your own hardware.',
      },
      {
        q: 'What web address does my hosted workspace get?',
        a: 'Its own subdomain, taken from the workspace name you pick at signup: call it Acme and you land on acme.ph-aros.com. A name written in another script is transliterated rather than thrown away, so «Πλαίσιο» becomes plaisio.ph-aros.com, and an accent folds into the letter it sits on (Müller reads as muller) instead of splitting the word in two; only a name with nothing usable left in it falls back to a generated label. If the address you would get is already in use, the next free one (-2, -3, and so on) is taken instead, and a short list of infrastructure labels (www, app, api, admin and friends) is reserved so no workspace can ever claim them. That subdomain is more than routing: each workspace also gets its own separate database rather than a shared table with a workspace column, so there is no query that can reach out of one workspace into another’s records. On the Dedicated plan you can point a domain of your own at your workspace instead, with the DNS and certificate set up together with us, and the original subdomain keeps resolving to the same place so links you have already saved do not break.',
      },
      {
        q: 'What happens when my free trial ends?',
        a: 'Every new hosted workspace starts on a 14-day free trial with full access, no card required to start. Three days before it ends you get one reminder email. If it lapses without adding billing, the workspace is suspended rather than deleted, a recoverable hold with nothing lost: add a payment method whenever you are ready and it reactivates instantly. That hold is kept for 30 days, the same window as Trash and as an account-deletion request, and after it passes the workspace and its files are deleted, so decide inside a month rather than whenever. Not sure yet? Export everything to JSON before the trial ends and self-host it free, since it is the same app.',
      },
      {
        q: 'Can my household or team share one instance?',
        a: 'Yes. Each instance sits behind a login and you can add accounts for the people you share with, so everyone signs into the same hub. Self-hosting has no seat limits at all; hosted plans scale from a single person up to a shared family or team workspace.',
      },
      {
        q: 'How do I invite people to a hosted workspace, and what can they do?',
        a: 'Send an email invite from Settings → Members and pick a role: owner, admin, or member. The invitee gets a signup link, and owners or admins can change roles, resend an expired invite, revoke a pending one, or remove someone later, with every change landing in an append-only activity log. Only an owner can promote someone else to owner, and a workspace can never end up with zero owners. Self-hosted has its own accounts system instead of email invites: an admin adds people from Settings → Users and assigns each one admin, member, or a read-only viewer role (viewers can browse everything but every create, edit, and delete is blocked, both in the app and over the API), no activity log, just accounts behind your own LAN or VPN.',
      },
      {
        q: 'Can I move between self-hosted and hosted?',
        a: 'Yes. PHAROS exports your whole dataset to JSON and imports it back by merging on record id, so you can start self-hosted and move to hosted later, or the other way round, without losing anything.',
      },
    ],
  },
  {
    title: 'AI features',
    note: 'Optional throughout, and always under your control',
    items: [
      {
        q: 'Do I need an AI API key?',
        a: 'No. AI is optional and can be toggled off per feature. Bring your own key (Anthropic, OpenAI, Gemini, OpenRouter, or any OpenAI-compatible custom endpoint) or run a local model with Ollama. The manual entry, tracking, and reporting work without any AI at all.',
      },
      {
        q: 'Does AI cost me money?',
        a: 'Only with a cloud provider, and only per request; a local Ollama model is free. A "confirm before bulk AI" guard in Settings shows a rough cost estimate before running AI over many records at once, so a large re-scan never surprises you with a bill.',
      },
      {
        q: 'Can I plug my own AI key into a hosted workspace too?',
        a: 'Yes. Workspace settings let you store your own Anthropic, OpenAI, Gemini, OpenRouter, or custom OpenAI-compatible key, and from then on that workspace runs its AI calls on it instead of the shared platform quota, so they stop counting against your plan’s monthly AI limit. The key is encrypted at rest (AES-256-GCM, a fresh encryption each time) and only ever shown back masked, last four characters, never in full; clear it any time to fall back to the included platform key. Self-hosted always brings its own key or a local Ollama model, so this only matters if you are on hosted.',
      },
      {
        q: 'Can I talk to it in plain English instead of clicking through menus?',
        a: 'Yes. A conversational AI command bar lives in the navbar (it doubles as global search) where you can type things like "add a YouTube subscription, 15 euros a month" or "log expense OTE 84 euros" and it acts directly on your data: adding expenses, income, subscriptions, tasks, or items, updating or deleting a record, logging a price, or just answering "what did I spend this month?". If a request is ambiguous it asks a short follow-up before doing anything, and every conversation is kept under AI history so you can look back at what it did. It needs an Anthropic-capable AI provider to run. A toggle right next to it switches to plain search with no AI involved: it matches items, receipts, statements, tasks, subscriptions, expenses, and vouchers by name, and a receipt match reaches past the store name into its own line items, so searching for a product you bought shows which receipt it came from and which line matched, even when the store itself never appears in the query.',
      },
    ],
  },
  {
    title: 'Getting your data in',
    note: 'Receipts, statements, bills and bulk imports',
    items: [
      {
        q: 'Can I add something to my list straight from a store’s page?',
        a: 'Yes. Paste a product URL into a new item and PHAROS fetches the page, then AI fills in the price, specs, category, and a photo. For a one-click path, drag a "Save to PHAROS" bookmarklet to your bookmarks bar from Settings → Storage & backup (a copy-code fallback covers browsers where dragging a link is awkward): click it on any product page and a small same-origin popup opens, riding your existing signed-in session, no API token exposed and nothing to install, then runs the same preview-before-you-confirm import. On Chrome there is also a native extension with a toolbar button and a right-click menu, no page-content permissions requested, so it can only ever read the URL of the tab you act on.',
      },
      {
        q: 'Can it read receipts and statements I already have?',
        a: 'Yes. Drag in a PDF or a photo and PHAROS parses the store, date, total, and line items automatically. Card statements are read the same way, including installment plans split across months. You can also bulk-import receipts straight from a Gmail export.',
      },
      {
        q: 'Can it pull receipts straight from my inbox without me exporting anything?',
        a: 'Yes, on self-hosted. Settings → Storage & backup → Email-in (IMAP) connects your mailbox (host, port, username, and an app-specific password if your provider needs one, which Gmail, Outlook, and iCloud usually do) and a "Check inbox now" button polls it on demand, no background cron running in the app. Each check fetches up to 25 new messages, PDF and image attachments as well as HTML bodies, through the exact same parse pipeline as a manual upload, one AI read per message. The first ever check only looks back 7 days so it does not flood your receipts with years of old mail; every check after that remembers the last message it saw and only fetches what is new since. It is a standing companion to the one-time Gmail export bulk-import above, not a replacement for it.',
      },
      {
        q: 'Does it match my receipts to card charges?',
        a: 'Yes. When you import a statement, PHAROS suggests which of your receipts each charge belongs to, matching on amount (within a couple of cents) and date (within a few days). You confirm the ones it gets right, so reconciling a month of spending is a few clicks instead of a spreadsheet.',
      },
      {
        q: 'Does it track bills I pay by hand, like utilities?',
        a: 'Yes. Bills you pay manually (power, phone, shared building costs) get their own tracker, separate from subscriptions that charge a card automatically. Each bill moves through due-soon, overdue, and paid on its own, worked out from the due date, so a triage list always shows what needs paying first. Mark one paid in a click, optionally log the matching expense, and a recurring bill queues up the next one. Reminders ping you a few days before anything falls due.',
      },
      {
        q: 'Can it learn to auto-categorize my expenses?',
        a: 'Yes. Settings → Money lets you define rules that map a vendor name, or any bit of text, to a category, and optionally mark it recurring with a cycle. New expenses run through your rules automatically whether they arrived from a scanned bill, a manual entry, or a CSV import, so a recognised vendor is already categorized when it lands. A one-click "Apply to existing" backfills every already-uncategorized expense retroactively, so turning this on later still cleans up your history.',
      },
      {
        q: 'Can it suggest a budget for me instead of me guessing numbers?',
        a: 'Yes. Settings → Money has a "Suggest from history" button next to your monthly budgets: it buckets your last three complete months of expenses by category, takes the median monthly total for each, rounds it to the nearest €5, and pre-fills the input fields, skipping any category with fewer than two months of history so one unusual purchase does not skew things. Nothing is saved automatically, you review the pre-filled numbers and click "Save budgets" yourself. No AI involved, just your own numbers median-averaged back at you.',
      },
      {
        q: 'Can I bulk-import expenses from a bank export?',
        a: 'Yes. Expenses → Import CSV takes any bank or card export: it auto-detects the delimiter (comma, semicolon, or tab), guesses which column is the date, amount, vendor, category, and notes from common English and Greek header names, and shows a live preview table so you can fix the mapping before anything is saved. Dates and amounts parse in both EU (day-first, comma-decimal) and US formats. If your export mixes money in and out in one signed amount column, a "split by sign" option sorts negative rows into expenses and positive rows into income automatically; otherwise every row lands in whichever tab you opened it from. Rows that match one you already imported (same vendor, day, and amount) are skipped, and your category rules run on the new ones automatically. With multi-currency on, a Revolut or Wise export mixing EUR and USD rows is read correctly too: the importer picks up the currency from its own column or sniffs the code straight off the amount cell, and the preview lets you set one exchange rate per currency for the whole file instead of typing a rate on every row. A row in a currency you have not rated yet still imports with its printed amount and code intact, and the result panel tells you how many rows still need one, instead of quietly folding foreign money into your base-currency totals.',
      },
      {
        q: 'Can it handle an expense in a currency other than my main one?',
        a: 'Yes, opt-in. Turn on multi-currency in Settings and the expense, income, receipt, subscription, item, and statement forms grow a currency picker plus an exchange-rate field: enter the printed foreign amount and either the rate or what your card actually got charged, and PHAROS backs the rate out for you. On a receipt every amount converts with that same rate, not just the total, since reports sum VAT and the item library copies line prices into your inventory, so a half-converted receipt would throw both off. A foreign-currency subscription converts its recurring charge and its post-trial first-charge amount with that same rate too, so a "cancel before you get charged" reminder and the monthly/yearly totals never mix currencies inside one record. An item bought abroad converts its purchased, current, and target prices together, so net worth and the insurance export see one consistent figure instead of a euro number quietly standing in for dollars. Paste a product link to import or price-check an item and the currency comes from the shop’s own page, not a guessed dollar sign: schema.org and Open Graph price markup are read first, and only what the model saw printed is used as a fallback, so a bare "$" is never assumed to mean US dollars over Canadian or Australian ones. A brand-new item adopts whatever currency the page declared and lands in that same missing-rate list; matching the price to an item you already own keeps that item’s own currency instead, so a differently-priced store link is still recorded but left out of that item’s price history until rated, and the result tells you which currency it skipped. A card statement converts as a whole document too: the total, minimum payment, and every individual charge, since installment payoff figures are summed from those same charges. A bill you pay by hand carries the same rate through both places it can end up: mark it paid with expense logging on and the printed foreign figure travels to that expense so it converts once, not twice, and a recurring bill’s next projected instance keeps the last known rate rather than showing up rate-less every cycle. Reports, budgets, and net worth keep summing everything in your base currency underneath, so nothing else changes. Leave a rate unset and a gold badge flags it rather than silently guessing a 1:1 conversion, and Reports keeps a running list of every record still missing one, grouped by the currency printed on it: set a rate once and "Apply to all" fills every record in that group, or override a single one, with a live preview of the converted amount before anything is stored. That turns a CSV import that left a dozen unrated rows behind into one fix in Reports instead of hunting down gold badges page by page. It now covers every money-holding record in the app and every way it gets in: expenses, income, receipts, subscriptions, items, statements, and bills typed in or scanned, plus foreign-currency rows in a bank CSV import. Do not want to type the rate yourself either? Every one of those rate fields, plus the Reports panel, also carries an optional "Market rate" button that fills in the European Central Bank’s daily reference rate for that currency pair, looked up as of the record’s own date when it has one so a March receipt is not priced off today’s rate. It is always a suggestion you can overwrite before saving, never applied on its own or on a schedule, since a card issuer’s actual rate carries a spread the ECB fixing does not. The lookup calls Frankfurter, a free key-less service, and a self-host that would rather not talk to a third party can point the FX_RATE_API_URL setting at their own instance instead; either way, only two currency codes and a date are ever sent, never any of your records.',
      },
    ],
  },
  {
    title: 'Tracking and reports',
    note: 'What it does with everything once it is in',
    items: [
      {
        q: 'Can I see all my renewals, installments, and bills in one calendar?',
        a: 'Yes. A three-month agenda unifies subscription renewals, credit-card installments aggregated per month, projected recurring bills and income, and warranty or voucher expiries, with a money-in / money-out total for each month, so "what is due this month" is a glance. The same agenda also publishes as a read-only iCal feed you can subscribe to from Google, Apple, or Outlook Calendar, authed by its own low-scope token so a leaked subscribe link never grants API access; generate, copy, or rotate it in Settings → AI.',
      },
      {
        q: 'Can I split spending across more than one home or property?',
        a: 'Yes. If you run more than one place, a main home and a cottage for example, you can tag each expense or income to a space and see exactly what each one costs. Add your spaces once and PHAROS filters spending by them and breaks it down in a per-space Reports view, so "how much does the cottage cost" is a glance. A recurring bill keeps its space when scanned, so a power bill for the cottage stays tagged. Leave it off and nothing changes; the feature only appears once you add a space.',
      },
      {
        q: 'Can it split a shared cost and track who owes me?',
        a: 'Yes. On any expense you paid, a built-in Splitwise-lite editor lets you add people by name (no account needed for them) and set each share, or press "Split equally" with an optional slice for yourself. Cards show a small badge with what is still owed on that expense, and a "Balances, who owes you" view rolls every split into a per-person total. When someone pays you back you settle them up in one click across all their shares at once. It stays dormant until you split something, so nothing changes for expenses you keep to yourself.',
      },
      {
        q: 'Can I keep a manual or warranty PDF with an item?',
        a: 'Yes. Every item has a document vault, separate from its photo gallery, for anything you would otherwise lose in a downloads folder: a manual, a warranty certificate, a scanned serial-number sticker, in any file type. Upload, rename, and delete as the pile grows. The responsive web app makes it easy to pull up a manual on your phone standing in front of the thing it belongs to. The insurance export below bundles this vault straight into its ZIP.',
      },
      {
        q: 'Can it produce an export for an insurance claim?',
        a: 'Yes. Settings → Storage & backup has a one-click "Insurance export (ZIP)" that bundles a CSV manifest and a standalone printable HTML report of every owned item, its value, serial number, and warranty, together with its photos, manuals, and linked receipts, exactly what an insurer asks for after a claim. Values use the same depreciation-adjusted estimate as Reports, so aging gear is not overstated.',
      },
      {
        q: 'How does it estimate what my stuff is still worth?',
        a: 'Reports and the insurance export both value your inventory with a declining-balance depreciation model: each item’s purchase price shrinks by a per-category annual rate (network 15%, storage 20%, compute 25%, and so on) compounding from its purchase date, never dropping below a salvage floor, 10% of the price by default. Settings → Depreciation lets you tune the default rate, the floor, and override any category, or switch it off entirely to value everything at face price instead. Log a manual current price that actually differs from what you paid and that number wins over the estimate.',
      },
      {
        q: 'Can it help with tax filing at year-end?',
        a: 'Yes. Mark any expense "tax-deductible" and give it a tax category (office supplies, travel, professional fees, or a custom one for your jurisdiction); a recurring bill inherits the flag so you only set it once. A "Tax-deductible only" filter and a gold badge make deductible spend easy to spot all year. At year-end, Settings → Backup has a "Tax export (ZIP)" button that bundles a CSV grouped by category, a printable HTML report, and every linked receipt or bill, ready to hand to an accountant or enter into tax software.',
      },
      {
        q: 'Can it help me save toward a goal?',
        a: 'Yes. Reports has savings goals: set a target amount and an optional deadline (e.g. "€5000 for new laptop by 2026-12-31"), then log contributions as you set money aside. A progress bar and a computed monthly contribution rate show whether you are on track to hit the deadline. Run as many goals in parallel as you like.',
      },
      {
        q: 'Does it track my net worth over time?',
        a: 'Yes. Reports keeps a monthly net-worth snapshot: everything you own (your inventory’s current value, plus any manual accounts you add for cash or bank balances) minus everything you owe (remaining installments and card balances). Opening Reports quietly upserts the current month, past months stay frozen, and once you have a couple of months of history a trend chart shows whether it is climbing or slipping, not just today’s number.',
      },
      {
        q: 'Can it notify me or plug into home automation?',
        a: 'Yes. Alert checks watch for deals hitting your target price, installments due this month, budgets going over, warranties expiring soon, bills due or overdue, price hikes, and expiring gift cards, then push a plain-language summary to ntfy, Discord, Slack, Telegram, or a generic webhook (Settings → Notifications). For automation platforms like Home Assistant, n8n, Node-RED, or Zapier, event webhooks send a signed JSON POST (Stripe-style HMAC signature) on specific triggers, receipt scanned, budget exceeded, installment due, price drop, so you can wire PHAROS into your own workflows.',
      },
    ],
  },
  {
    title: 'Data, privacy and security',
    note: 'Where your data lives, and how you get it back',
    items: [
      {
        q: 'What data leaves my machine?',
        a: 'Self-hosted, nothing by default: PHAROS stores everything locally and has zero telemetry. The one exception is AI, since pointing it at a cloud provider sends the document being parsed to that provider, while a local Ollama keeps it fully offline. Hosted is the deliberate opposite, because that is the point of us running it: your content lives on our servers so we can back it up and parse it for you, in a database of your workspace’s own rather than a shared table, and the AI parsing your documents is named in the Privacy Policy along with every other sub-processor. There is still no telemetry and nothing is ever sold. If that trade is not one you want to make, self-host: it is the same app, free, and you can move your whole dataset between the two at any time.',
      },
      {
        q: 'How do backups work?',
        a: 'Self-hosted ships with a nightly backup you can point at a NAS, plus one-click JSON and CSV exports any time, and you can mirror your files to SMB, FTP, or OneDrive for a proper 3-2-1 setup. On hosted we run it for you, and "backup" here means something specific rather than a checkbox. Every database is dumped, the control plane and each workspace, together with the files under /storage, because a database restored without its receipts and statements is a catalogue of documents nobody can open. Each archive is then copied off the server, since a copy sitting on the same disk as the data it protects is not a backup. And it is not called done until it passes three checks: the archive is non-empty, it is a valid gzip, and a dry-run restore proves it would actually load, which catches a truncated dump that looks perfectly fine on disk. Restoring is a script we have run end to end into a scratch stack rather than a hypothesis, and it verifies the indexes came back afterwards, since a restore that reports success but silently drops your unique indexes is the kind of failure you only discover much later. Both scripts live in the repo, so a self-hoster gets exactly the same drill.',
      },
      {
        q: 'What happens if I delete something by mistake?',
        a: 'Most deletes are reversible. Items, receipts, expenses, subscriptions, vouchers, gift cards, loyalty cards, bills, goals, and tasks are soft-deleted, hidden from the app but their files and links kept, and land in Trash (Settings → Storage & backup) where you can restore them with one click or delete them forever. Anything left in Trash auto-purges after 30 days, so it is a safety net, not permanent storage. Card statements are the one exception: they are removed for good straight away, so re-importing the same month never gets blocked by a trashed copy still holding its slot.',
      },
      {
        q: 'Is my financial data secure?',
        a: 'Self-hosted, PHAROS is built for private access rather than the open internet: reach it over your LAN or your own VPN, behind a login, with no public sign-up and no telemetry. Hosted has to face the internet to be useful, so it is protected differently: encryption in transit, secrets encrypted at rest, optional two-factor authentication, and a separate database per workspace, so there is no query that can reach out of one workspace into another’s records. Either way there is no telemetry and your receipts, statements, and balances are never sold or shared for anyone else’s purposes.',
      },
      {
        q: 'Does it support two-factor authentication?',
        a: 'On hosted, yes: turn on TOTP-based two-factor authentication from account settings with any authenticator app (Google Authenticator, 1Password, and so on), confirm it with a 6-digit code, and save the one-time recovery codes it gives you. Once enabled, every login asks for that second factor, not just this browser or device. Self-hosted already has per-person accounts (admin, member, viewer, managed from Settings → Users) but no TOTP step on top of them yet, so this extra layer is a hosted-only feature for now.',
      },
      {
        q: 'Can I download a copy of everything you have on me?',
        a: 'Yes. On hosted, account settings has a one-click download of your personal data (profile and workspace memberships) for GDPR portability, and a workspace owner or admin gets two more from workspace settings: the full workspace content as JSON (items, receipts, expenses, and the rest, for every member) and a manifest of stored file paths for receipts, statements, and photos. These are quick, on-demand downloads for a rights request, separate from the whole-dataset export used to migrate between self-hosted and hosted. Self-hosted already keeps everything on your own disk, so there is nothing to request.',
      },
      {
        q: 'Can I permanently delete my account and all its data?',
        a: 'Yes. On hosted, the workspace owner has a "Delete workspace" control in settings: request it and every member loses access with all data erased after a 30-day grace window, plenty of time to change your mind, and you can cancel any time before then. Self-hosted has no server-side account at all, so deleting your data just means removing the Docker volumes on your own hardware.',
      },
    ],
  },
];

// Flat view of every question, used for the FAQPage structured data.
const FAQS: { q: string; a: string }[] = FAQ_GROUPS.flatMap((g) => g.items);


// Stable, human-readable anchor id for each FAQ item, e.g. "faq-how-do-backups-work".
// Deterministic from the question so deep links stay valid across builds.
const faqId = (q: string): string =>
  'faq-' +
  q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'PHAROS',
      alternateName: 'Personal Hub · Asset & Resource Oversight System',
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      description:
        'PHAROS is a personal hub for overseeing everything you own, from a single private dashboard. Self-host it free under AGPL-3.0, or use the managed hosted service.',
      sameAs: [GITHUB_URL],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'PHAROS',
      url: SITE_URL,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'PHAROS',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Docker, Linux, macOS',
      description:
        'A personal hub: inventory, receipts read by AI, expenses, credit-card installments, subscriptions, vouchers, and reports, in one private dashboard you control. Available self-hosted under AGPL-3.0, or as a managed hosted service.',
      url: SITE_URL,
      author: { '@type': 'Person', name: 'Achilleas' },
      publisher: { '@id': `${SITE_URL}/#organization` },
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      softwareHelp: `${GITHUB_URL}/blob/main/README.md`,
      // Per-plan Offers, one per priced tier (free self-host + the Pro/Dedicated hosted
      // plans defined in apps/web/src/lib/billing/plans.ts). There is no free hosted
      // offer: hosted starts on a 14-day trial and is paid after it.
      // Paid tiers expose BOTH billing options: monthly, and annual (monthly x10 = 2 months free),
      // and say the trial in their description (schema.org has no trial property) so a
      // rich result never reads €9 as due on day one.
      // Availability reflects the real pre-launch state so search engines are not told
      // an item is buyable when it is not: the self-host tier tracks REPO_PUBLIC
      // (PreOrder while the repo is private, InStock the moment it opens), and a hosted plan
      // stays PreOrder while self-serve payment is closed (activation is by code today).
      offers: TIERS.filter((t) => t.amount !== undefined).map((t) => ({
        '@type': 'Offer',
        name: `PHAROS ${t.name}`,
        price: t.amount,
        priceCurrency: 'EUR',
        description: t.selfHost ? t.tagline : `${t.tagline} Starts with a 14-day free trial.`,
        availability:
          t.selfHost && REPO_PUBLIC
            ? 'https://schema.org/InStock'
            : 'https://schema.org/PreOrder',
        ...(t.amount !== '0' && {
          priceSpecification: [
            {
              '@type': 'UnitPriceSpecification',
              name: 'Monthly',
              price: t.amount,
              priceCurrency: 'EUR',
              unitText: 'MONTH',
              billingDuration: 1,
              billingIncrement: 1,
            },
            {
              // Annual = monthly x10 (two months free)
              '@type': 'UnitPriceSpecification',
              name: 'Annual',
              price: String(Number(t.amount) * 10),
              priceCurrency: 'EUR',
              unitText: 'ANN',
              billingDuration: 12,
              billingIncrement: 1,
            },
          ],
        }),
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        url: `${SITE_URL}/#${faqId(f.q)}`,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'HowTo',
      '@id': `${SITE_URL}/#self-host`,
      name: 'Self-host PHAROS with Docker',
      description:
        'Bring up the PHAROS personal hub, MongoDB, and search with a single Docker Compose file. Your data never leaves your machine.',
      inLanguage: 'en',
      tool: [
        { '@type': 'HowToTool', name: 'Docker' },
        { '@type': 'HowToTool', name: 'Docker Compose' },
      ],
      step: STEPS.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.title,
        text: s.desc,
        url: `${SITE_URL}/#self-host`,
      })),
    },
  ],
};

export default function Home() {
  return (
    <main>
      <a href="#top" className="skip-link">Skip to content</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {/* ── Nav ───────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(10,10,10,0.7)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
          }}
        >
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PharosMark size={28} />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                letterSpacing: '0.14em',
                fontSize: '1.05rem',
              }}
            >
              PHAROS
            </span>
          </a>
          <nav className="site-nav">
            <a href="#features" className="navlink nav-anchor">Features</a>
            <a href="#ai" className="navlink nav-anchor">AI</a>
            <a href="#who" className="navlink nav-anchor">Who</a>
            <a href="#self-host" className="navlink nav-anchor">Self-host</a>
            <a href="#pricing" className="navlink">Pricing</a>
            <a href="#compare" className="navlink nav-anchor">Compare</a>
            <a href="#roadmap" className="navlink nav-anchor">Roadmap</a>
            <a href="#faq" className="navlink nav-anchor">FAQ</a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="navlink"
            >
              GitHub
            </a>
            <a href={`${APP_URL}/account/login`} className="nav-signin">
              Sign in
            </a>
          </nav>
          <MobileNav githubUrl={GITHUB_URL} appUrl={APP_URL} />
        </div>
      </header>
      <ScrollProgress />
      <ScrollSpy />
      <BackToTop />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section id="top" tabIndex={-1} style={{ textAlign: 'center', padding: '112px 0 96px', outline: 'none' }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <PharosMark size={72} />
          </div>

          <p className="mono" style={{ marginBottom: 20 }}>
            Personal Hub · Asset &amp; Resource Oversight System
          </p>

          <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 800, marginBottom: 22 }}>
            One light over{' '}
            <span
              className="hero-highlight"
              style={{
                background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              everything you run.
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: 'var(--text-dim)',
              maxWidth: 620,
              margin: '0 auto 40px',
            }}
          >
            A personal hub for oversight on everything you own. Inventory,
            receipts read by AI, expenses, credit-card installments,
            subscriptions, and vouchers, in one private dashboard.
            Self-host it free, or let us run it for you.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#pricing" className="btn btn-primary">Get started</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Self-host it free
              {!REPO_PUBLIC && <span className="soon-badge">soon</span>}
            </a>
          </div>

          <ul className="hero-assurance" aria-label="What you get">
            {HERO_TRUST.map((t) => (
              <li key={t.label} className="hero-chip">
                <span className="hero-chip-ico" style={{ color: t.color }}>
                  <Icon name={t.icon} size={15} />
                </span>
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Product showcase ──────────────────────────────── */}
      <section id="preview" style={{ padding: '16px 0 64px' }}>
        <div className="container">
          <div className="showcase" aria-label="PHAROS dashboard preview">
            <div className="win-bar">
              <div className="win-dots"><span /><span /><span /></div>
              <div className="win-addr">pharos.local / dashboard</div>
              <span className="win-online">AI online</span>
            </div>
            <div className="win-body">
              <div className="win-head">
                <h4>Good evening, Achilleas</h4>
                <span>Tue · 01 Jul</span>
              </div>

              <div className="stat-row">
                {SHOWCASE_STATS.map((s) => (
                  <div key={s.lbl} className="stat-tile">
                    <span className="lbl">{s.lbl}</span>
                    <span className="val" style={{ color: s.color }}>{s.val}</span>
                  </div>
                ))}
              </div>

              <div className="mod-grid">
                {SHOWCASE_MODS.map((m) => (
                  <div key={m.title} className="mod-tile">
                    <span className="mod-ico" style={{ color: m.color }}>
                      <span className="g" style={{ background: m.color }} />
                      <Icon name={m.icon} size={17} />
                    </span>
                    <span>
                      <span className="t" style={{ display: 'block' }}>{m.title}</span>
                      <span className="c">{m.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── By the numbers ────────────────────────────────── */}
      <section id="numbers" style={{ padding: '8px 0 40px' }}>
        <div className="container">
          <ul className="numbers-band">
            {STATS.map((s) => (
              <li key={s.lbl} className="number-tile">
                <span className="num-glow" style={{ background: s.color }} aria-hidden="true" />
                <span className="num" style={{ color: s.color }}>{s.num}</span>
                <span className="lbl">{s.lbl}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────── */}
      <section id="features" style={{ padding: '64px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>What&apos;s inside</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 }}>
              One hub for every part of your life admin
            </h2>
          </div>

          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="card feature-card">
                <span className="feature-icon" style={{ color: f.color }}>
                  <span className="feature-glow" style={{ background: f.color }} />
                  <Icon name={f.icon} size={22} />
                </span>
                <h3 style={{ fontSize: '1.12rem', margin: '16px 0 8px' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI in action (flagship spotlight) ─────────────── */}
      <section id="ai" style={{ padding: '56px 0' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>AI that reads your paperwork</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Drop a receipt. Get structured data.
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Photos, PDFs, or forwarded emails go in. Store, date, totals, VAT,
              and every line item come out, ready to file. Bring your own model
              or run it fully local.
            </p>
          </div>

          <div className="ai-flow">
            <div className="ai-panel">
              <span className="ai-panel-label">Drop in</span>
              <div className="ai-receipt" aria-hidden="true">
                <span className="ai-rline w-60" />
                <span className="ai-rline w-40" />
                <span className="ai-rline w-80" />
                <span className="ai-rline w-50" />
                <span className="ai-rline w-70" />
                <span className="ai-rline w-30" />
              </div>
              <span className="ai-file">
                <Icon name="receipt" size={15} />
                receipt_plaisio.pdf
              </span>
            </div>

            <span className="ai-arrow" aria-hidden="true">
              <Icon name="chevron" size={22} />
            </span>

            <div className="ai-panel ai-panel-out">
              <span className="ai-panel-label">Parsed out</span>
              <ul className="ai-fields">
                {AI_FIELDS.map((f) => (
                  <li key={f.k} className="ai-field">
                    <span className="k">{f.k}</span>
                    <span className="v" style={f.color ? { color: f.color } : undefined}>{f.v}</span>
                  </li>
                ))}
              </ul>
              <div className="ai-lines">
                {AI_LINES.map((l) => (
                  <div key={l.name} className="ai-lineitem">
                    <span className="chk"><Icon name="check" size={13} /></span>
                    <span className="nm">{l.name}</span>
                    <span className="pr">{l.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ul className="ai-notes">
            {AI_NOTES.map((n) => (
              <li key={n.label} className="ai-note">
                <span className="ai-note-ico"><Icon name={n.icon} size={15} /></span>
                {n.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Integrations (works with your stack) ──────────── */}
      <section id="integrations" style={{ padding: '48px 0' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Works with your stack</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Plugs into what you already run
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Keep your files where you want them, point it at any AI model, and
              wire up the alerts you care about. No lock-in, no forced cloud.
            </p>
          </div>

          <ul className="integ-grid">
            {INTEGRATIONS.map((g) => (
              <li key={g.group} className="card integ-group">
                <div className="integ-head">
                  <span className="integ-icon" style={{ color: g.color }}>
                    <span className="integ-glow" style={{ background: g.color }} />
                    <Icon name={g.icon} size={18} />
                  </span>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 600 }}>{g.group}</h3>
                </div>
                <ul className="integ-pills">
                  {g.items.map((item) => (
                    <li key={item} className="integ-pill">
                      <span className="integ-dot" style={{ background: g.color }} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Who it's for (personas) ───────────────────────── */}
      <section id="who" style={{ padding: '48px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Who it&apos;s for</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 }}>
              Built for people who own their stack
            </h2>
          </div>

          <div className="persona-grid">
            {PERSONAS.map((p) => (
              <article key={p.title} className="card persona-card">
                <span className="feature-icon" style={{ color: p.color }}>
                  <span className="feature-glow" style={{ background: p.color }} />
                  <Icon name={p.icon} size={22} />
                </span>
                <h3 style={{ fontSize: '1.12rem', margin: '16px 0 8px' }}>{p.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem', lineHeight: 1.55 }}>
                  {p.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust / principles strip ──────────────────────── */}
      <section id="trust" style={{ padding: '48px 0 64px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Built on principles, not promises</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 }}>
              Your data, your rules
            </h2>
          </div>

          <ul className="trust-grid">
            {TRUST.map((t) => (
              <li key={t.title} className="card trust-card">
                <span className="trust-icon" style={{ color: t.color }}>
                  <span className="trust-glow" style={{ background: t.color }} />
                  <Icon name={t.icon} size={20} />
                </span>
                <h3 style={{ fontSize: '1rem', margin: '14px 0 6px' }}>{t.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                  {t.desc}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it works (self-host) ──────────────────────── */}
      <section id="self-host" style={{ padding: '64px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Self-host</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Up and running in three steps
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              One Docker Compose file brings up the app, MongoDB, and search.
              Your data never leaves your machine.
            </p>
          </div>

          <div className="steps-grid">
            {STEPS.map((s, i) => (
              <article key={s.title} className="card step-card">
                <span className="step-num">{i + 1}</span>
                <h3 style={{ fontSize: '1.08rem', marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.92rem' }}>{s.desc}</p>
              </article>
            ))}
          </div>

          {!REPO_PUBLIC && (
            <p className="repo-soon">
              <span className="repo-soon-dot" aria-hidden="true" />
              The public repo opens right before launch.{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>Email us</a> and we&apos;ll send the clone
              link the moment it goes live.
            </p>
          )}

          <div className="code-wrap">
            <CopyButton text={QUICKSTART_COMMANDS} />
            <pre className="code-block" aria-label="Docker quick start">
              <span className="tok-comment"># Pull and start the stack</span>{'\n'}
              <span className="tok-cmd">git clone</span> {GITHUB_URL}.git{'\n'}
              <span className="tok-cmd">cd</span> pharos{'\n'}
              <span className="tok-cmd">cp</span> .env.example .env   <span className="tok-comment"># set your secrets</span>{'\n'}
              <span className="tok-cmd">docker compose up</span> -d{'\n'}
              {'\n'}
              <span className="tok-comment"># Open http://localhost:3000</span>
            </pre>
          </div>

          <div className="deploy-strip">
            <p className="mono deploy-label">Runs anywhere you do</p>
            <ul className="deploy-pills">
              {DEPLOY_TARGETS.map((target) => (
                <li key={target} className="deploy-pill">
                  <span className="deploy-dot" aria-hidden="true" />
                  {target}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Under the hood (tech stack) ───────────────────── */}
      <section id="stack" style={{ padding: '48px 0 64px' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Under the hood</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              No mystery box
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Every part of the stack is open and self-contained. Read the code,
              audit the dependencies, and run the whole thing on your own hardware.
            </p>
          </div>

          <ul className="stack-grid">
            {STACK.map((s) => (
              <li key={s.name} className="card stack-tile">
                <span className="stack-name">
                  <span className="stack-dot" style={{ background: s.color }} aria-hidden="true" />
                  {s.name}
                </span>
                <span className="stack-detail">{s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '64px 0 96px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Pricing</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Own it, or let us host it
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Self-host the whole thing free under AGPL-3.0, forever, or pick a managed
              plan and skip the setup. Every hosted plan starts with a 14-day free trial,
              no card to begin, and includes AI parsing and nightly backups.
            </p>
          </div>

          <Pricing
            tiers={TIERS}
            repoPublic={REPO_PUBLIC}
            githubUrl={GITHUB_URL}
            inviteOnly={HOSTED_INVITE_ONLY}
          />

          {HOSTED_INVITE_ONLY && (
            <p className="repo-soon" style={{ marginTop: 30, marginBottom: 0 }}>
              <span className="repo-soon-dot" aria-hidden="true" />
              Hosted PHAROS is in private beta: creating a workspace needs an invite code.
              Ask for one at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Already
              invited by email? Open that link instead, it needs no code.
            </p>
          )}

          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem', marginTop: 36 }}>
            Prices in EUR, cancel anytime. Hosted plans open with a 14-day free trial, then
            bill monthly, or once a year on annual (2 months free). Self-hosting stays free
            forever under AGPL-3.0, with no plan and no account at all.
          </p>
        </div>
      </section>

      {/* ── Compare (self-host vs hosted) ─────────────────── */}
      <section id="compare" style={{ padding: '32px 0 72px' }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Side by side</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 }}>
              Self-hosted vs hosted
            </h2>
          </div>

          <div className="compare-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Feature</span></th>
                  <th scope="col">Self-hosted</th>
                  <th scope="col" className="hl">Hosted</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td data-col="Self-hosted">{r.self}</td>
                    <td data-col="Hosted" className="hl">{r.hosted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem', marginTop: 28 }}>
            Same app either way. Export to JSON and switch whenever you like.
          </p>
        </div>
      </section>

      {/* ── Roadmap ───────────────────────────────────────── */}
      <section id="roadmap" style={{ padding: '48px 0 72px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Roadmap</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Where PHAROS is headed
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Most of the app already ships. Here is what is live, what we are
              building, and what is next.
            </p>
          </div>

          <div className="roadmap-grid">
            {ROADMAP.map((col) => (
              <article key={col.phase} className="card roadmap-col">
                <div className="roadmap-head">
                  <span className="roadmap-dot" style={{ background: col.color }} aria-hidden="true" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{col.phase}</h3>
                </div>
                <p style={{ color: 'var(--text-faint)', fontSize: '0.82rem', marginBottom: 18 }}>
                  {col.note}
                </p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {col.items.map((it) => (
                    <li key={it} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.9rem' }}>
                      <span style={{ color: col.color, flexShrink: 0, marginTop: 2 }}>
                        <Icon name="check" size={15} />
                      </span>
                      <span style={{ color: 'var(--text-dim)' }}>{it}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem', marginTop: 32 }}>
            Priorities can shift. Open an issue on{' '}
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              GitHub
            </a>{' '}
            to weigh in.
          </p>
        </div>
      </section>

      {/* ── Secondary CTA band ────────────────────────────── */}
      <section id="cta" style={{ padding: '8px 0 40px' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="cta-band">
            <div className="cta-band-inner">
              <p className="mono" style={{ marginBottom: 14 }}>Two paths, one app</p>
              <h2 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
                Ready to see everything in one place?
              </h2>
              <p style={{ color: 'var(--text-dim)', maxWidth: 520, margin: '0 auto 30px' }}>
                Run it yourself for free, forever, or let us host it for you.
                Your data, your call, and you can switch either way.
              </p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="#pricing" className="btn btn-primary">Get started</a>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Self-host it free
                  {!REPO_PUBLIC && <span className="soon-badge">soon</span>}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section id="faq" style={{ padding: '64px 0' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Questions</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 }}>
              Answers before you ask
            </h2>
          </div>

          <div className="faq-groups">
            {FAQ_GROUPS.map((g) => (
              <section
                key={g.title}
                className="faq-group"
                aria-labelledby={`faq-group-${faqId(g.title)}`}
              >
                <div className="faq-group-head">
                  <h3 id={`faq-group-${faqId(g.title)}`} className="faq-group-title">
                    {g.title}
                  </h3>
                  <p className="faq-group-note">{g.note}</p>
                </div>
                <div className="faq-list">
                  {g.items.map((f) => (
                    <details key={f.q} id={faqId(f.q)} className="faq-item">
                      <summary className="faq-q">
                        <span>{f.q}</span>
                        <span className="faq-chevron" aria-hidden="true">
                          <Icon name="chevron" size={18} />
                        </span>
                      </summary>
                      <div className="faq-a">
                        <p>{f.a}</p>
                        <FaqCopyLink id={faqId(f.q)} />
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <FaqDeepLink />
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '56px 0 32px' }}>
        <div className="container">
          <div className="footer-grid">
            {/* Brand column */}
            <div className="footer-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <PharosMark size={24} />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    fontSize: '1rem',
                  }}
                >
                  PHAROS
                </span>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', maxWidth: 280, marginBottom: 14 }}>
                One light over everything you run. Personal Hub · Asset &amp; Resource Oversight System.
              </p>
              <p className="mono" style={{ color: 'var(--text-faint)' }}>// achilleas</p>
            </div>

            {/* Link columns */}
            <div className="footer-col">
              <p className="footer-heading mono">Product</p>
              <a href="#features" className="navlink">Features</a>
              <a href="#pricing" className="navlink">Pricing</a>
              <a href="#self-host" className="navlink">Self-host</a>
              <a href="#compare" className="navlink">Compare</a>
            </div>

            {/* The repo is PRIVATE until launch, so every link into it (Docs, issues, the
                LICENSE file) is a 404 for a visitor — verified: the README link returned 404.
                A footer full of dead links reads as an abandoned project, so they appear only
                once REPO_PUBLIC flips. Until then this column is the two things that do work:
                the way in, and a human to write to. */}
            <div className="footer-col">
              <p className="footer-heading mono">Get started</p>
              {/* Kept linked (a beta tester holding a code needs somewhere to go) but
                  labelled, so nobody clicks through expecting an open door. */}
              <a href={`${APP_URL}/account/signup`} className="navlink">
                Create an account
                {HOSTED_INVITE_ONLY && <span className="soon-badge">invite only</span>}
              </a>
              <a href={`${APP_URL}/account/login`} className="navlink">Sign in</a>
              <a href="#self-host" className="navlink">Run it yourself</a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="navlink">Contact</a>
            </div>

            <div className="footer-col">
              <p className="footer-heading mono">Legal</p>
              <a href="/privacy" className="navlink">Privacy</a>
              <a href="/terms" className="navlink">Terms</a>
              {/* Security used to link to the raw /.well-known/security.txt. That file exists
                  for scanners and stays served at its well-known path; a person who found a
                  vulnerability wants an address, not a text file. */}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Security report')}`}
                className="navlink"
              >
                Report a vulnerability
              </a>
              <a href="#faq" className="navlink">FAQ</a>
              {REPO_PUBLIC && (
                <>
                  <a href={GITHUB_URL} className="navlink" target="_blank" rel="noopener noreferrer">GitHub</a>
                  <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="navlink" target="_blank" rel="noopener noreferrer">
                    License (AGPL-3.0)
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="footer-bar">
            <span className="mono" style={{ color: 'var(--text-faint)' }}>© 2026 PHAROS · AGPL-3.0</span>
            <span className="mono" style={{ color: 'var(--text-faint)' }}>Open source · self-hostable · no telemetry</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
