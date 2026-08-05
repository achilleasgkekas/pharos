# Deploying Pharos (hosted SaaS)

Target: one Hetzner Cloud server, Ubuntu 24.04, Docker. Everything below runs **on the server**
unless it says otherwise.

This directory is only for the hosted multi-tenant deployment. The repo-root `docker-compose.yml`
(your own single-user instance) and `docker-compose.saas-dev.yml` (local scratch stack) are
untouched by it: different project name, different volumes, different everything.

---

## 0. Before you start

- DNS for the domain must be on **Cloudflare** (nameservers moved and the zone active). The
  wildcard certificate is issued over DNS-01, which needs Cloudflare's API, not a web server.
- Two DNS records, both **proxied off (grey cloud)** so Let's Encrypt and the app see the real IP:

  | Type | Name | Value |
  |------|------|-------|
  | A    | `@`  | your server IP |
  | A    | `*`  | your server IP |

  The wildcard is what makes `<workspace>.ph-aros.com` resolve. Without it, signup works and every
  workspace 404s.
- A Cloudflare API token with **Zone:Read + DNS:Edit on this zone only**. Not the Global API Key:
  that one can do anything to every zone you own, and it will be sitting in a file on a machine
  that is exposed to the internet.

## 1. Get the code onto the server

The repo is private, so the server needs read access. A **deploy key** is the least dangerous
option: it is read-only and scoped to this one repository, unlike a personal access token.

On the server:

```bash
ssh-keygen -t ed25519 -C "pharos-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Paste that into GitHub → the repo → Settings → Deploy keys → Add, **without** write access. Then:

```bash
mkdir -p /opt && git clone git@github.com:achilleasgkekas/pharos.git /opt/pharos
```

## 2. Configure

```bash
cd /opt/pharos/deploy
cp .env.prod.example .env.prod
chmod 600 .env.prod
```

Fill in `.env.prod`. Generate each secret separately with `openssl rand -base64 32`.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` deserves a word: it must stay **fixed forever**. If it
changes, every browser tab that is already open is holding action ids the new build no longer
recognises, and the next click gives the user an error page.

## 3. Start

```bash
cd /opt/pharos
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

First boot takes a few minutes: it compiles the app and builds a Caddy with the Cloudflare plugin.
Watch the certificate being issued:

```bash
docker logs -f pharos-caddy
```

Then check the app answers:

```bash
curl -sI https://ph-aros.com/account/login | head -3
```

## 4. Schedule the background jobs

Four endpoints are driven by cron, not by the app. They authenticate with `CRON_SECRET` and live
under `/api/cron/`, which is the only path excluded from the session gate.

Call them through `deploy/cron-call.sh`, never with the token inline. `ps` shows every process
argv to every local user, so a `-H "Authorization: Bearer ..."` in the crontab leaks the secret for
as long as the request runs, and duplicates a value that already has a `600` home in `.env.prod`.
The script reads it from there and hands it to curl through a config file on stdin.

`crontab -e` (UTC; backup first, so a bad night still has today's copy):

```cron
20 3 * * * /opt/pharos/deploy/backup.sh >> /var/log/pharos-backup.log 2>&1
17 4 * * * /opt/pharos/deploy/cron-call.sh usage-sample     >> /var/log/pharos-cron.log 2>&1
27 4 * * * /opt/pharos/deploy/cron-call.sh trials-sweep     >> /var/log/pharos-cron.log 2>&1
32 4 * * * /opt/pharos/deploy/cron-call.sh suspended-sweep  >> /var/log/pharos-cron.log 2>&1
37 4 * * * /opt/pharos/deploy/cron-call.sh erasure-purge    >> /var/log/pharos-cron.log 2>&1
```

The order is load-bearing, not cosmetic: `trials-sweep` creates suspensions, `suspended-sweep`
warns them and schedules the expired ones for erasure, `erasure-purge` reports what is due. Run
back to front and each stage acts on yesterday's state.

Confirm one works before trusting the schedule, in the environment cron will actually use (an
empty env with cron's default `PATH`) rather than your login shell:

```bash
env -i PATH=/usr/bin:/bin /opt/pharos/deploy/cron-call.sh trials-sweep
```

## 5. Backups

`deploy/backup.sh` dumps **every** database (the registry plus one per workspace) and tars
`/storage`. Both halves are required: Mongo stores only file paths, so a database restored without
the files is a catalogue of receipts nobody can open.

Set `BACKUP_REMOTE` to an rclone remote (a Hetzner Storage Box is the obvious pairing) or the
script will tell you, every night, that it is protecting you from nothing. A copy on the same disk
dies with the disk.

The script refuses to call a backup successful unless the archive passes a **dry-run restore**, not
just a size check. An empty or truncated dump that "exists" is the failure that goes unnoticed for
months.

### Test the restore before you need one

An untested backup is a hypothesis. Rehearse into a scratch stack, never production:

```bash
docker compose -f docker-compose.saas-dev.yml up -d mongo
MONGO_CONTAINER=pharos-saas-mongo MONGO_USER=admin MONGO_PASSWORD=devlocal \
  deploy/restore.sh deploy/backups/mongo-YYYYMMDD-HHMMSS.archive.gz
```

`restore.sh` excludes `admin.*` and `config.*` for a reason found by actually running it:
`mongodump` cannot exclude a database, so the archive always contains `admin.system.users`.
Restoring that replaces the target's user catalogue *while mongorestore is authenticated against
it*, and the result is "63 documents restored successfully" followed by every index silently
failing to build. A registry without its unique indexes will happily accept two workspaces with
the same slug. The script now verifies indexes exist after restoring.

## 6. Updating

```bash
cd /opt/pharos && git pull && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build web
```

Mongo and Caddy keep running; only the app restarts.

---

## Not ready yet

Two things are wired but inert until you supply credentials, and it is better to know now than
after a customer signs up:

- **Email.** With no `RESEND_API_KEY`, the mailer writes messages to the container log instead of
  sending them. Verification links, invitations and trial-expiry warnings reach nobody.
- **Billing.** Without the Stripe keys the billing pages render and checkout does nothing. There is
  no way for anyone to pay you.

Both are fine for a private beta with your own data. Neither is fine for a paying customer.
