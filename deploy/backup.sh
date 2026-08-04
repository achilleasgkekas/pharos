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
if [ -n "${BACKUP_SSH:-}" ]; then
  # rsync over SSH — the dependency-free path, and the one a Hetzner Storage Box wants (port 23,
  # key auth). Preferred over rclone precisely because it needs nothing installed and nothing
  # configured beyond a key that is already there.
  SSH_OPTS="ssh -p ${BACKUP_SSH_PORT:-23} -o BatchMode=yes"
  [ -n "${BACKUP_SSH_KEY:-}" ] && SSH_OPTS="$SSH_OPTS -i ${BACKUP_SSH_KEY}"
  REMOTE_HOST="${BACKUP_SSH%%:*}"
  REMOTE_DIR="${BACKUP_SSH#*:}"
  # A Hetzner Storage Box is a RESTRICTED shell, not a Linux login: it answers `ls`, `mkdir`, `rm`
  # and rsync, and replies "Command not found" to anything else. `mkdir` has no -p there.
  $SSH_OPTS "$REMOTE_HOST" "mkdir $REMOTE_DIR" >/dev/null 2>&1 || true
  rsync -e "$SSH_OPTS" "$DUMP" "$FILES" "$BACKUP_SSH/" || {
    echo "FATAL: offsite copy FAILED — the local copy exists but is not protected" >&2; exit 1
  }

  # Remote retention. `find -mtime -delete` does NOT exist on that shell — it printed "Command not
  # found" and the prune silently never ran, which would have filled the box while every run kept
  # reporting success. So: list the remote, work out which files are past the window FROM THEIR
  # NAMES (they carry a UTC timestamp), and remove exactly those.
  #
  # Deliberately NOT `rsync --delete` to mirror local retention: that couples the remote copy to
  # the local one, so a wiped or mis-mounted local backups directory would delete the offsite
  # copies too — the backup script destroying the backups is precisely the disaster this exists to
  # prevent. Explicit removal of named files can only ever remove files we recognise.
  CUTOFF="$(date -u -d "${KEEP_DAYS} days ago" +%Y%m%d 2>/dev/null || date -u -v-"${KEEP_DAYS}"d +%Y%m%d)"
  OLD="$($SSH_OPTS "$REMOTE_HOST" "ls $REMOTE_DIR" 2>/dev/null \
        | tr -d '\r' \
        | awk -v c="$CUTOFF" '
            /^(mongo|storage)-[0-9]{8}-[0-9]{6}\./ {
              d = $0; sub(/^[a-z]+-/, "", d); sub(/-.*/, "", d);
              if (d < c) print
            }')"
  if [ -n "$OLD" ]; then
    # One session, one rm per file, quoted paths.
    CMD=""; for f in $OLD; do CMD="$CMD rm $REMOTE_DIR/$f;"; done
    $SSH_OPTS "$REMOTE_HOST" "$CMD" >/dev/null 2>&1 || echo "  (remote prune failed, not fatal)"
    echo "  pruned $(echo "$OLD" | wc -w | tr -d ' ') old file(s) offsite"
  fi
  echo "  -> $BACKUP_SSH"
elif [ -n "${BACKUP_REMOTE:-}" ]; then
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
  echo "  !! No offsite target: these files are on the SAME DISK as the data they protect."
  echo "  !! A disk failure or a wrong 'docker volume rm' takes both. Set BACKUP_SSH (rsync, no"
  echo "  !! dependencies) or BACKUP_REMOTE (rclone)."
fi

find "$OUT" -name 'mongo-*.archive.gz' -mtime "+$KEEP_DAYS" -delete
find "$OUT" -name 'storage-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "done: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)), $(basename "$FILES") ($(du -h "$FILES" | cut -f1))"
