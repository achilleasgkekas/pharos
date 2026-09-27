# FAQ

<sub>[📚 Docs home](README.md) · [✨ Features](features.md) · [🚀 Self-hosting](self-hosting.md) · [⚙️ Configuration](configuration.md) · [❓ FAQ](faq.md)</sub>

Common questions about PHAROS, grouped by topic. For step-by-step guides see the
[documentation index](README.md).

## Contents

- [General](#general)
- [Self-hosting](#self-hosting)
- [Privacy & data ownership](#privacy--data-ownership)
- [AI](#ai)
- [Storage & backups](#storage--backups)
- [Cost & licensing](#cost--licensing)
- [Troubleshooting](#troubleshooting)

---

## General

### What is PHAROS?

A self-hosted personal hub. It keeps track of the things you own (inventory and
shopping), the money you spend and earn (receipts, expenses, income, credit-card
statements with installments, subscriptions, vouchers), and the small logistics
of running a household (bills, utilities, vehicles, personal documents, special
dates, calendar, reports and tasks). Optional AI reads your documents so you do not have to type
them in by hand. See [Features](features.md) for a per-module tour.

### Who is it for?

People who want one private place for their receipts, purchases, and recurring
money, running on hardware they control, behind their own login. It is
mobile-first (it is often used over a VPN from a phone) and dark-mode by default.

### What do I need to run it?

A host that runs Docker (a small always-on machine, a NAS, a Proxmox LXC, or a
Mac mini). The stack is a Next.js web app plus MongoDB, both in Docker Compose.
Full requirements are in [Self-hosting](self-hosting.md).

### Do I have to expose it to the internet?

No. The intended setup is private: reach it over a VPN (for example WireGuard on
your gateway) rather than publishing it. It ships with a login, but there is no
public sign-up on the self-hosted app.

---

## Self-hosting

Pharos is available as self-hosted software under AGPL-3.0. There is no managed
hosted service, hosted signup or paid plan. You operate the application, choose
its optional integrations, and maintain your database, files and backups.

## Privacy & data ownership

### Where is my data stored?

On your own hardware when self-hosting: metadata in MongoDB, and the actual
files (receipt images, statement PDFs) on local disk under `data/storage`. The
app always serves files from local disk; any remote backend (SMB/FTP/OneDrive)
is a push-only mirror, never the source of truth.

### Does anything get sent to the cloud?

Only what you configure. With AI set to a local provider (Ollama) nothing leaves
your machine. If you choose a cloud AI provider (Anthropic, OpenAI, Gemini,
OpenRouter, or a custom endpoint), the document text or image you scan is sent to
that provider for that request. Notifications go to whatever service you set
(ntfy, Discord, Slack, Telegram, or a webhook). See
[Configuration](configuration.md).

### Can I turn AI off entirely?

Yes. AI is optional and gated per feature, so you can run PHAROS with no AI at
all and type entries in by hand, or enable it only for the modules you want.

---

## AI

### What does the AI actually do?

It reads documents so you do not have to transcribe them: receipts (store, date,
line items, VAT, total), credit-card statements (transactions and installment
plans), expenses/income bills, product pages (specs, price, photos), vouchers,
and subscriptions. There is also an AI command bar on the dashboard where you can
type things like "add a Netflix subscription, 15 euro monthly" in plain language.

### Which AI providers are supported?

Ollama (local), Anthropic, OpenAI, Gemini, OpenRouter, and any OpenAI-compatible
custom endpoint (LM Studio, Groq, Mistral, DeepSeek, vLLM, and similar). The
scraper can use its own separate provider. Details in
[Configuration → AI providers](configuration.md).

### Local or cloud AI — which is better?

Local (Ollama) is private and free but slower, and small local vision models
struggle with dense or non-English receipts. Cloud providers are faster and more
accurate but cost money per call and send the document to a third party. Many
users keep AI local for privacy and switch to a cloud key when they need better
accuracy on a hard document.

### Does AI cost me money?

Only with a cloud provider, and only per request. There is a "confirm before
bulk AI" guard in settings that shows a rough cost estimate before running AI
over many items at once, so a large re-scan never surprises you.

---

## Storage & backups

### How are backups handled?

Three ways, and you can combine them: a JSON export/restore of all your data from
**Settings → Storage & backup**, CSV export of receipts/expenses/items, and a
remote file mirror (SMB, FTP, or OneDrive) that pushes copies of your documents
off the box. A local disk plus one remote mirror plus a periodic JSON export
gives you a simple 3-2-1 setup.

### Can I mirror my files to a NAS or OneDrive?

Yes. Storage backends are local (default), SMB, FTP, and OneDrive. Remote is
always a mirror/backup; the app keeps working from local disk even if the remote
is unreachable. Setup is in [Configuration → Storage](configuration.md).

### Are deletes reversible?

Yes. Most deletes are soft: items, receipts, expenses, subscriptions, vouchers,
and tasks move to a Trash that you can restore from. Trash auto-purges old
entries, and "delete forever" does the real cleanup.

---

## Cost & licensing

### What license is PHAROS under?

AGPL-3.0. You can self-host it for free, modify it, and run it for yourself. The
AGPL terms apply if you offer it as a network service to others. See the
[LICENSE](../LICENSE).

### Is self-hosting free?

Yes. The only costs are your own hardware and electricity, plus optional cloud AI
usage if you choose a cloud provider instead of local Ollama.

## Troubleshooting

### The app or AI is not working — where do I start?

The [Troubleshooting guide](troubleshooting.md) groups the most common problems
by area (startup, login, database, AI, storage, notifications, import,
performance) and links back to the relevant guide for each.

### I updated the app and an open tab throws an error

That is a stale bundle after a rebuild: the open tab still references old server
actions. Do a hard refresh (Cmd/Ctrl+Shift+R). This is expected after any deploy.

### AI says "offline" even though my cloud key works

The status indicator is provider-aware, but a half-configured provider falls back
to local Ollama. Check that the selected provider and its key/model are set in
**Settings → AI**. More in [Troubleshooting → AI](troubleshooting.md).
