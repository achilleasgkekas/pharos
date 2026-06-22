#!/usr/bin/env bash
#
# Nightly MongoDB backup → NAS (3-2-1 strategy).
# Dumps the `homepage` DB straight out of the running Mongo container into a
# single gzipped archive, then prunes archives older than RETENTION_DAYS.
#
# Usage:
#   ./scripts/backup.sh
#
# Configure via env (defaults shown):
#   MONGO_USER=admin  MONGO_PASS=changeme  MONGO_DB=homepage
#   MONGO_CONTAINER=homepage-mongo
#   BACKUP_DIR=/Volumes/NAS/backups/homepage   # point at the DS923+ NFS mount
#   RETENTION_DAYS=14
#
# Cron (every night at 03:30):
#   30 3 * * * /path/to/homepage/scripts/backup.sh >> /tmp/homepage-backup.log 2>&1
#
set -euo pipefail

MONGO_USER="${MONGO_USER:-admin}"
MONGO_PASS="${MONGO_PASS:-changeme}"
MONGO_DB="${MONGO_DB:-homepage}"
MONGO_CONTAINER="${MONGO_CONTAINER:-homepage-mongo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TS="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/${MONGO_DB}-${TS}.archive.gz"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
  echo "ERROR: Mongo container '$MONGO_CONTAINER' is not running." >&2
  exit 1
fi

echo "[$(date)] Dumping '$MONGO_DB' from '$MONGO_CONTAINER' → $OUT"
docker exec "$MONGO_CONTAINER" mongodump \
  --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin \
  --db "$MONGO_DB" --archive --gzip > "$OUT"

if [ ! -s "$OUT" ]; then
  echo "ERROR: backup file is empty, aborting." >&2
  rm -f "$OUT"
  exit 1
fi

echo "[$(date)] Backup OK ($(du -h "$OUT" | cut -f1))"

# Rotation: drop archives older than RETENTION_DAYS
find "$BACKUP_DIR" -name "${MONGO_DB}-*.archive.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/[pruned] /' || true

echo "[$(date)] Done. Kept archives:"
ls -1t "$BACKUP_DIR"/${MONGO_DB}-*.archive.gz 2>/dev/null | head -5
