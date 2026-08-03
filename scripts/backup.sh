#!/usr/bin/env bash
#
# Nightly MongoDB backup → NAS (3-2-1 strategy).
# Dumps the `homepage` DB straight out of the running Mongo container into a
# single gzipped archive, VERIFIES that the archive is actually restorable, and
# only then puts it in place and prunes old ones.
#
# Usage:
#   ./scripts/backup.sh
#
# Configure via env (defaults shown):
#   MONGO_DB=homepage   MONGO_CONTAINER=homepage-mongo
#   BACKUP_DIR=<repo>/backups          # point at the DS923+ NFS mount
#   RETENTION_DAYS=14
#   MIN_BYTES=1024                     # floor below which a dump is assumed broken
#   NTFY_URL=                          # optional; posted to on FAILURE only
#
# Credentials are NOT configured here. They are read from the running Mongo
# container's own environment, so there is no copy to go stale and no password
# on the host process list. See "why" below.
#
# Cron (every night at 03:30):
#   30 3 * * * /path/to/homepage/scripts/backup.sh >> /tmp/homepage-backup.log 2>&1
#
# ---------------------------------------------------------------------------
# 2026-08-03: rewritten after finding 47 of 50 archives in ~/Backups/pharos were
# ZERO BYTES, the newest real backup 53 days old, while launchd reported success
# every night. Three separate faults, all fixed here:
#
#   1. The launchd copy of this script carried a HARDCODED password that stopped
#      matching Mongo, so every mongodump died with AuthenticationFailed. Now the
#      credentials come out of the container itself and cannot drift.
#   2. `> "$OUT"` creates the file BEFORE mongodump runs, and under `set -e` a
#      failing mongodump aborted the script instantly — so the "backup file is
#      empty, aborting / rm -f" guard below it was unreachable dead code and the
#      empty file survived. Now the dump goes to a temp file that is only moved
#      into place after it verifies, and a trap cleans up on any exit path.
#   3. Nothing ever read the archive back, so "the file exists" was mistaken for
#      "the backup works". Now every run does a real `mongorestore --dryRun`
#      against the archive before accepting it.
#
# Retention also refused to learn: it pruned by age alone, so a run of broken
# nights would delete the last GOOD archive while carefully keeping the empty
# ones. Pruning now only ever removes files that are not the newest valid backup.
# ---------------------------------------------------------------------------
set -uo pipefail

MONGO_DB="${MONGO_DB:-homepage}"
MONGO_CONTAINER="${MONGO_CONTAINER:-homepage-mongo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_BYTES="${MIN_BYTES:-1024}"
NTFY_URL="${NTFY_URL:-}"

TS="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/${MONGO_DB}-${TS}.archive.gz"
TMP="$OUT.partial"

STATUS_FILE="$BACKUP_DIR/LAST_RUN_FAILED.txt"

log() { echo "[$(date '+%F %T')] $*"; }

# A failure must be LOUD and must not leave a corpse behind. The old script left
# a 0-byte file every night and said nothing anyone read.
cleanup() { [ -f "$TMP" ] && rm -f "$TMP"; }
trap cleanup EXIT

# Best-effort: reuse whatever ntfy the app itself is configured with, rather than
# duplicating the URL into a plist that can drift out of sync (which is exactly
# how the password rotted). Dormant and harmless while ntfy is unconfigured.
if [ -z "$NTFY_URL" ] && docker ps --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
  NTFY_URL=$(docker exec "$MONGO_CONTAINER" sh -c '
      mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" \
              --authenticationDatabase admin homepage \
              --eval "const c=db.appconfigs.findOne({},{ntfyUrl:1,ntfyEnabled:1}); print(c && c.ntfyEnabled && c.ntfyUrl ? c.ntfyUrl : \"\")"' 2>/dev/null | tr -d '\r\n' || true)
fi

fail() {
  log "BACKUP FAILED: $*"
  # A file in the backup folder itself, because the thing nobody reads is the log:
  # this went unnoticed for 53 nights precisely because the only evidence was in
  # /tmp/pharos-backup.log. Removed again by the next successful run.
  mkdir -p "$BACKUP_DIR" 2>/dev/null
  echo "[$(date '+%F %T')] $*" >> "$STATUS_FILE" 2>/dev/null
  [ -n "$NTFY_URL" ] && curl -fsS -m 10 -H "Title: Pharos backup FAILED" -d "$*" "$NTFY_URL" >/dev/null 2>&1
  exit 1
}

mkdir -p "$BACKUP_DIR" || fail "cannot create $BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
  fail "Mongo container '$MONGO_CONTAINER' is not running."
fi

# Credentials never touch this script or the host process list: the inner shell
# expands them inside the container, from the env compose already gave it.
log "Dumping '$MONGO_DB' from '$MONGO_CONTAINER'"
if ! docker exec -e DUMP_DB="$MONGO_DB" "$MONGO_CONTAINER" sh -c '
      mongodump --username "$MONGO_INITDB_ROOT_USERNAME" \
                --password "$MONGO_INITDB_ROOT_PASSWORD" \
                --authenticationDatabase admin \
                --db "$DUMP_DB" --archive --gzip' > "$TMP" 2>/tmp/pharos-backup-dump.err; then
  fail "mongodump failed: $(tail -2 /tmp/pharos-backup-dump.err | tr '\n' ' ')"
fi

SIZE=$(wc -c < "$TMP" | tr -d ' ')
[ "$SIZE" -ge "$MIN_BYTES" ] || fail "archive is only ${SIZE}B (min ${MIN_BYTES}B) — treating as a broken dump."

# What was actually captured. mongodump reports one "done dumping `db.coll` (N
# documents)" line per collection on stderr, so the counts come free and a dump
# that connected but scraped nothing is caught here rather than at restore time.
COLLECTIONS=$(grep -c 'done dumping' /tmp/pharos-backup-dump.err 2>/dev/null || true)
DOCS=$(grep -oE '\(([0-9]+) documents?\)' /tmp/pharos-backup-dump.err 2>/dev/null | grep -oE '[0-9]+' | awk '{s+=$1} END {print s+0}')
[ "${COLLECTIONS:-0}" -gt 0 ] || fail "dump wrote no collections at all."
[ "${DOCS:-0}" -gt 0 ] || fail "dump produced $COLLECTIONS collections but 0 documents."

# The point of the whole rewrite: prove the bytes are RESTORABLE, not merely
# present. --dryRun reads and parses the whole archive, writing nothing to the DB.
# This is what would have caught the 47 empty nights on the very first one.
log "Verifying archive is restorable (${SIZE} bytes, $COLLECTIONS collections, $DOCS docs)"
if ! VERIFY=$(docker exec -i "$MONGO_CONTAINER" sh -c '
      mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" \
                   --password "$MONGO_INITDB_ROOT_PASSWORD" \
                   --authenticationDatabase admin \
                   --archive --gzip --dryRun' < "$TMP" 2>&1); then
  fail "archive did not verify: $(echo "$VERIFY" | tail -2 | tr '\n' ' ')"
fi

mv "$TMP" "$OUT" || fail "cannot move archive into place"
rm -f "$STATUS_FILE"
log "Backup OK: $OUT ($(du -h "$OUT" | cut -f1), $COLLECTIONS collections, $DOCS docs)"
[ -z "$NTFY_URL" ] && log "note: ntfy is not configured, so a future failure will only show up in this log and in $STATUS_FILE"

# Rotation: age-based as before, but never touch the newest valid archive, so a
# stretch of failures can no longer eat the last good backup.
NEWEST="$(ls -1t "$BACKUP_DIR"/${MONGO_DB}-*.archive.gz 2>/dev/null | head -1)"
while IFS= read -r old; do
  [ "$old" = "$NEWEST" ] && continue
  rm -f "$old" && echo "[pruned] $old"
done < <(find "$BACKUP_DIR" -name "${MONGO_DB}-*.archive.gz" -type f -mtime +"$RETENTION_DAYS" 2>/dev/null)

log "Done. Kept archives:"
ls -1t "$BACKUP_DIR"/${MONGO_DB}-*.archive.gz 2>/dev/null | head -5
