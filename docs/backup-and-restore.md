# Backup & restore

Your Pharos data lives in two places, and a complete backup covers **both**:

1. **The database** (`homepage` in MongoDB) — every record: items, receipts,
   expenses, statements, subscriptions, vouchers, tasks, stores, cards, budgets,
   settings, and the AI-parsed metadata.
2. **The files** (`./data/storage`) — the actual receipt images/PDFs, statement
   PDFs, item photos, and thumbnails. The database only stores *paths* to these;
   the bytes live on disk.

If you back up only one of the two, a restore will leave you with records that
point at missing files, or files that no records reference. Back up both.

This guide covers the full offline dump (the real backup), the in-app JSON and
CSV exports (portable subsets), the optional remote storage mirror, and the
Trash / soft-delete safety net. It follows a 3-2-1 approach: keep the offline
dump in at least two places, one of them off the host.

Related: [Self-hosting](self-hosting.md) · [Configuration](configuration.md) ·
[Features](features.md) · [Troubleshooting](troubleshooting.md).

---

## Contents

- [1. The complete backup (database + files)](#1-the-complete-backup-database--files)
- [2. Automating the nightly dump](#2-automating-the-nightly-dump)
- [3. Restoring from a dump](#3-restoring-from-a-dump)
- [4. In-app JSON export/import (portable subset)](#4-in-app-json-exportimport-portable-subset)
- [5. CSV export (spreadsheet / accountant)](#5-csv-export-spreadsheet--accountant)
- [6. Remote storage mirror (SMB/FTP/OneDrive)](#6-remote-storage-mirror-smbftponedrive)
- [7. Trash & soft-delete (undo a deletion)](#7-trash--soft-delete-undo-a-deletion)
- [8. What to keep, and where](#8-what-to-keep-and-where)

---

## 1. The complete backup (database + files)

### Database — `scripts/backup.sh`

The repo ships `scripts/backup.sh`: a gzipped `mongodump` taken straight out of
the running Mongo container into a single archive, with old archives pruned by
age. Run it against a running stack:

```bash
./scripts/backup.sh
```

It produces `homepage-<timestamp>.archive.gz` in `BACKUP_DIR` and keeps the last
`RETENTION_DAYS` archives. Everything is configurable via env (defaults shown):

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_USER` | `admin` | Mongo admin user (match your `.env`). |
| `MONGO_PASS` | `changeme` | Mongo admin password (match your `.env`). |
| `MONGO_DB` | `homepage` | Database name. |
| `MONGO_CONTAINER` | `homepage-mongo` | The Mongo container name. |
| `BACKUP_DIR` | `./backups` | Where archives are written. Point at a NAS mount. |
| `RETENTION_DAYS` | `14` | Archives older than this are deleted. |

The script fails loudly if the container is not running or the archive comes out
empty, so a broken backup never silently overwrites a good rotation.

> Point `BACKUP_DIR` at network storage (e.g. your DS923+ NFS/SMB mount) so the
> archive already leaves the host the moment it is written.

### Files — `./data/storage`

The binary files are bind-mounted into the web container from `./data/storage`
on the host (`STORAGE_ROOT=/storage` inside the container). Back this directory
up with any file-level tool (`rsync`, `restic`, Time Machine, a NAS snapshot):

```bash
rsync -a --delete ./data/storage/ /Volumes/NAS/backups/pharos-storage/
```

Files are content-addressed and never rewritten in place, so incremental
file-level backups stay small after the first run.

---

## 2. Automating the nightly dump

Schedule `scripts/backup.sh` with cron (Linux hosts / most self-host setups):

```cron
30 3 * * * /path/to/pharos/scripts/backup.sh >> /tmp/pharos-backup.log 2>&1
```

On macOS, `cron` and background agents cannot read `~/Desktop` (TCC), so if the
repo lives under `~/Desktop`, run the agent from a copy outside it and write
archives outside it too (for example a script under
`~/Library/Application Support/Pharos/` writing to `~/Backups/pharos/`),
scheduled with a `launchd` LaunchAgent. Either way, verify the log the next
morning and confirm a fresh `.archive.gz` appeared.

Pair the nightly dump with a nightly `rsync` (or NAS snapshot) of
`./data/storage` so database and files are captured on the same schedule.

---

## 3. Restoring from a dump

Use `scripts/restore.sh` with the archive you want to restore:

```bash
./scripts/restore.sh /path/to/backups/homepage-2026-06-05_033000.archive.gz
```

It is **destructive**: it runs `mongorestore --drop`, so the target collections
are dropped and replaced by the archive's contents. It asks for a typed `yes`
before proceeding. Same `MONGO_*` env vars as `backup.sh`.

To restore files, copy your `./data/storage` backup back into place before
starting (or while stopped), then bring the stack up. Restore both from the same
point in time so records and files stay consistent.

---

## 4. In-app JSON export/import (portable subset)

**Settings → Storage & backup → Export JSON / Restore**

The JSON export (`pharos-backup-YYYY-MM-DD.json`) is a portable, human-readable
snapshot you can download from the browser. It is convenient for moving data
between instances, but it is **not** a substitute for the full dump above.

What it includes — the documents (metadata) of these eight collections:

`items`, `receipts`, `statements`, `subscriptions`, `vouchers`, `cards`,
`tasks`, `stores`.

What it does **not** include:

- **Expenses / income** records.
- **App settings**, budgets, AI/storage/notification configuration.
- **Binary files** — only the paths are stored, not the receipt/PDF/photo bytes.

Restoring a JSON backup (admin only) upserts each document **by `_id`**, so it
merges into the existing database and never creates duplicates. File-path fields
in an imported backup are validated and any that try to escape the storage
directory (absolute paths, `..` traversal) are dropped, so a tampered backup
cannot aim the file server or purge at arbitrary paths.

> Use the mongodump (section 1) for disaster recovery; use JSON export for a
> quick portable copy or an instance-to-instance move.

---

## 5. CSV export (spreadsheet / accountant)

**Settings → Storage & backup → Spreadsheet (CSV)**

Export a single collection as a `.csv` for a spreadsheet, an accountant, or a
tax filing. Three kinds are available, downloaded as `pharos-<kind>-YYYY-MM-DD.csv`:

| Kind | Columns |
|---|---|
| `receipts` | Store, Date, Total, Net, VAT, Payment, Verified |
| `expenses` | Kind, Vendor, Category, Amount, Date, Period, Recurring, Verified |
| `items` | Title, Category, Status, Current price, Paid, Bought from, Serial, Location, Warranty until |

Files are UTF-8 with a BOM (so Excel opens Greek/accented text correctly) and are
CSV-injection guarded (a leading `=`, `+`, `-`, `@` in a value is prefixed with
`'` so a spreadsheet does not evaluate it as a formula). CSV is for reading, not
for restoring — there is no CSV import.

---

## 6. Remote storage mirror (SMB/FTP/OneDrive)

**Settings → Storage & backup → File storage**

Pharos is local-first: it always serves and reads files from the local
`./data/storage`. The remote backends (SMB, FTP, OneDrive) are a **push-only
mirror** of your files, not a live filesystem — Pharos copies files out to them,
it never reads back from them. See [Configuration](configuration.md) for
connecting each backend.

The mirror is a convenience copy of the *files*. It does not back up the
database. Keep the mongodump (section 1) as your source of truth for records.

---

## 7. Trash & soft-delete (undo a deletion)

Deleting a record (item, receipt, expense, subscription, voucher, task) does not
erase it immediately — it is soft-deleted and hidden from every view, with its
files and links kept intact for a lossless restore.

**Settings → Storage & data → Trash** lists deleted records and lets you
**restore** them or **delete forever**. Trashed records auto-purge after about
30 days; "Empty Trash" purges immediately. Purging is the point at which files
are actually removed from disk.

This is an in-app undo, not a backup: it protects against accidental deletions,
not against database loss. See [Features](features.md) for the Trash UI.

> Statements are hard-deleted (not soft-deleted), because the `{card, period}`
> uniqueness constraint would otherwise block re-importing the same month while a
> trashed copy still holds the slot. Re-import the statement PDF to recover one.

---

## 8. What to keep, and where

A minimal, sound routine:

1. **Nightly** `scripts/backup.sh` → an archive on the host **and** on a NAS
   mount (`BACKUP_DIR`), 14-day retention.
2. **Nightly** `rsync`/snapshot of `./data/storage` to the same NAS.
3. **Occasionally** a JSON export (section 4) kept off-site — a small,
   human-readable extra copy of the core records.
4. Confirm restores work: periodically run `scripts/restore.sh` against a
   throwaway instance so the archive is proven, not just assumed.

That satisfies 3-2-1: the data exists in at least three copies (host, NAS,
off-site), on two media, with one off the host. If any single disk dies, you can
rebuild from the others.

For problems restoring or backing up, see
[Troubleshooting → Database](troubleshooting.md).
