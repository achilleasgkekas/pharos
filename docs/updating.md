# Updating PHAROS

<sub>[📚 Docs home](README.md) · [✨ Features](features.md) · [🚀 Self-hosting](self-hosting.md) · [⚙️ Configuration](configuration.md) · [❓ FAQ](faq.md)</sub>

How to move an existing instance to a newer version, safely and reversibly.
This expands on the short "Updating" note in the [Self-hosting guide](self-hosting.md#8-updating).

The golden rule: **back up before every upgrade**, then pull, then restart. Your
data lives outside the app image, so a version swap never touches it — but a
backup is your undo button if a release misbehaves. See
[Backup & restore](backup-and-restore.md) for the full procedure.

---

## Contents

- [1. What persists across an upgrade](#1-what-persists-across-an-upgrade)
- [2. Before you upgrade](#2-before-you-upgrade)
- [3. Upgrading the prebuilt image](#3-upgrading-the-prebuilt-image)
- [4. Upgrading from source](#4-upgrading-from-source)
- [5. Image tags & version pinning](#5-image-tags--version-pinning)
- [6. Database migrations](#6-database-migrations)
- [7. After the upgrade](#7-after-the-upgrade)
- [8. Rolling back](#8-rolling-back)
- [9. Upgrading MongoDB](#9-upgrading-mongodb)

---

## 1. What persists across an upgrade

Only the **web application image** changes when you upgrade. Everything stateful
is stored in Docker volumes that outlive the image:

| State | Where it lives | Survives an image swap? |
| --- | --- | --- |
| Database (all records) | `mongo-data` named volume → `/data/db` | Yes |
| Uploaded files (receipts, PDFs, photos) | `./data/storage` bind mount → `/storage` | Yes |
| Your `.env` (secrets, config) | on the host, next to the compose file | Yes |

Because of this, `pull` + `up -d` keeps your data. The only ways to lose it are
`docker compose down -v` (removes named volumes) or deleting `./data/storage` —
neither is part of a normal upgrade.

> Keep your `.env` stable across upgrades. In particular, **do not regenerate**
> `AUTH_SECRET` or `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` — changing them logs
> everyone out and can invalidate in-flight Server Actions. See
> [Configuration](configuration.md).

---

## 2. Before you upgrade

1. **Take a full backup** — database *and* files. The database stores only file
   paths, so a DB-only dump is not a complete backup:

   ```bash
   ./scripts/backup.sh                     # mongodump archive
   tar czf pharos-storage-$(date +%F).tgz data/storage   # the files
   ```

   Full details and automation in [Backup & restore](backup-and-restore.md).

2. **Note the version you are on**, so you can pin back to it if needed:

   ```bash
   docker inspect --format '{{.Config.Image}}' homepage-web
   ```

3. **Skim the release notes / [ROADMAP](../ROADMAP.md)** for anything flagged as a
   breaking change before jumping across several versions.

---

## 3. Upgrading the prebuilt image

If you deploy with the published GHCR image (`docker-compose.prod.yml`):

```bash
docker compose -f docker-compose.prod.yml pull    # fetch the new web image
docker compose -f docker-compose.prod.yml up -d   # recreate the web container
```

`up -d` recreates only the containers whose image or config changed; MongoDB and
the other services keep running. To confirm the new image is live:

```bash
docker compose -f docker-compose.prod.yml ps
docker inspect --format '{{.Config.Image}}' homepage-web
```

---

## 4. Upgrading from source

If you run the dev compose that builds locally (`docker-compose.yml`):

```bash
git pull
docker compose up -d --build
```

This rebuilds the web image from the updated source and recreates the container.
The build can take a few minutes on first run after a large change.

---

## 5. Image tags & version pinning

Release images are published to **GHCR** by the *Release image* workflow:

- Pushing a semver tag `vX.Y.Z` publishes `:X.Y.Z`, `:X.Y`, `:X`, and moves `:latest`.
- A manual workflow run publishes `:edge` (does **not** move `:latest`).

The prod compose defaults to `:latest`:

```yaml
image: ${PHAROS_IMAGE:-ghcr.io/achilleasgkekas/pharos:latest}
```

For controlled, predictable upgrades, pin an exact version in `.env` instead of
tracking `:latest`:

```dotenv
# .env
PHAROS_IMAGE=ghcr.io/achilleasgkekas/pharos:1.2.3
```

Then upgrade deliberately by bumping that value and re-running `pull` + `up -d`.
Pinning to a floating tag like `:1` (latest patch of major 1) is a middle ground:
you get bug fixes without unexpected major jumps.

Images are multi-arch (`linux/amd64` and `linux/arm64`), so the same tag runs on
both x86 servers (Proxmox) and Apple Silicon.

---

## 6. Database migrations

PHAROS has **no separate migration step to run when upgrading.** The data model
evolves in a backward-compatible way through Mongoose schemas: new fields are
optional and default sensibly, so an older document keeps working after the app
is upgraded.

The one script named `scripts/migrate.ts` is **not** an upgrade migration — it is
the one-off import from the legacy tracker JSON into MongoDB, used only during
initial setup. You do not run it on version upgrades.

If a future release ever needs a real data migration, it will be called out in
the release notes; a fresh backup (section 2) makes any such step safe to retry.

<!-- TODO: link a CHANGELOG here once the project publishes one; today the
     ROADMAP and git history are the change record. -->

---

## 7. After the upgrade

- **Hard-refresh open browser tabs** (Ctrl/Cmd+Shift+R). A stable
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` keeps most Server Actions working across
  restarts, but a tab holding an *old* bundle can still error until reloaded.
- **Check the web logs** for a clean start:

  ```bash
  docker compose -f docker-compose.prod.yml logs -f web
  ```

- **Sanity-check** login, one page load, and one file preview. If something is
  off, see [Troubleshooting](troubleshooting.md).

---

## 8. Rolling back

Because data is separate from the image, rolling the app back is just pinning to
the previous tag:

```dotenv
# .env — set to the version you noted in section 2
PHAROS_IMAGE=ghcr.io/achilleasgkekas/pharos:1.2.2
```

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Only restore the database/files from your pre-upgrade backup if the newer version
actually wrote data you need to undo; a plain version rollback does not require a
data restore. Restore steps are in [Backup & restore](backup-and-restore.md).

---

## 9. Upgrading MongoDB

The database image is pinned to `mongo:7` in the compose files, so a routine app
upgrade does **not** change your MongoDB version. Bumping the major MongoDB
version (e.g. 7 → 8) is a separate, deliberate operation: take a full backup
first, follow MongoDB's official upgrade path (do not skip major versions), and
verify the app afterwards. For most self-hosters there is no reason to change the
pinned MongoDB version.

---

See also: [Self-hosting](self-hosting.md) · [Backup & restore](backup-and-restore.md) ·
[Configuration](configuration.md) · [Troubleshooting](troubleshooting.md).
