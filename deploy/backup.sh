#!/usr/bin/env bash
# Nightly backup for the Pharos production stack.
#
# TWO things must be captured, and capturing only one is the classic way to discover that your
# backup was useless:
#   1. EVERY database — the control plane (pharos_registry: tenants, accounts, memberships) AND
#      one database per workspace. `mongodump` with no --db takes them all, which is what we want
#      precisely because the set of databases grows every time somebody signs up.
#   2. The FILES under /storage — receipts, statements, item photos. Mongo stores only paths, so
#      a database restored without the files is a catalogue of documents nobody can open.
#
# A backup that stays on the same disk as the data is not a backup. Set BACKUP_REMOTE (an rclone
# remote) or this script will complete "successfully" while protecting you from nothing, and it
# says so loudly rather than exiting 0 in silence.
#
# Restore is deploy/restore.sh. Run it against a scratch stack at least once, on purpose, before
# you need it: an untested backup is a hypothesis, not a safety net.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

[ -f .env.prod ] || { echo "deploy/.env.prod not found" >&2; exit 1; }
set -a; . ./.env.prod; set +a

STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR:-$HERE/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
MONGO_USER="${MONGO_USER:-pharos}"
mkdir -p "$OUT"

DUMP="$OUT/mongo-$STAMP.archive.gz"
FILES="$OUT/storage-$STAMP.tar.gz"

echo "[1/4] dumping every database"
# --archive to stdout so nothing is written inside the container. --gzip halves the size of a
# dump that is mostly repetitive BSON.
docker exec pharos-mongo mongodump \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  --archive --gzip > "$DUMP"

# An empty or truncated archive is the failure mode that goes unnoticed for months, because the
# file EXISTS and the script exited 0. Check the dump can actually be read back before trusting it.
if [ ! -s "$DUMP" ]; then
  echo "FATAL: dump is empty" >&2; exit 1
fi
echo "[2/4] verifying the archive is readable"
if ! gzip -t "$DUMP" 2>/dev/null; then
  echo "FATAL: dump is not a valid gzip archive" >&2; exit 1
fi
# Ask mongorestore to parse it without writing anything. This catches a truncated BSON stream,
# which `gzip -t` alone cannot see.
# Same --nsExclude as the real restore, so the rehearsal matches the performance (see restore.sh
# for why admin must never be restored).
if ! docker exec -i pharos-mongo mongorestore \
      --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
      --archive --gzip --dryRun --quiet \
      --nsExclude 'admin.*' --nsExclude 'config.*' < "$DUMP"; then
  echo "FATAL: dump failed a dry-run restore — it would NOT restore" >&2; exit 1
fi

echo "[3/4] archiving /storage"
tar -czf "$FILES" -C "$HERE" storage

echo "[4/4] copying offsite"
if [ -n "${BACKUP_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "FATAL: BACKUP_REMOTE is set but rclone is not installed" >&2; exit 1
  fi
  rclone copy "$DUMP" "$BACKUP_REMOTE/" --no-traverse
  rclone copy "$FILES" "$BACKUP_REMOTE/" --no-traverse
  # Prune the remote too. A retention policy that only applies locally quietly fills the remote
  # until it starts rejecting writes, and the first failed upload is usually the one you needed.
  rclone delete "$BACKUP_REMOTE/" --min-age "${KEEP_DAYS}d" || true
  echo "  -> $BACKUP_REMOTE"
else
  echo "  !! BACKUP_REMOTE is empty: these files are on the SAME DISK as the data they protect."
  echo "  !! A disk failure or a wrong 'docker volume rm' takes both. Set BACKUP_REMOTE."
fi

find "$OUT" -name 'mongo-*.archive.gz' -mtime "+$KEEP_DAYS" -delete
find "$OUT" -name 'storage-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "done: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)), $(basename "$FILES") ($(du -h "$FILES" | cut -f1))"
