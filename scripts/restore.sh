#!/usr/bin/env bash
#
# Restore a MongoDB backup produced by backup.sh into the running container.
# DESTRUCTIVE for the target collections (uses --drop). Asks before proceeding.
#
# Usage:
#   ./scripts/restore.sh /Volumes/NAS/backups/homepage/homepage-2026-06-05_033000.archive.gz
#
set -euo pipefail

MONGO_USER="${MONGO_USER:-admin}"
MONGO_PASS="${MONGO_PASS:-changeme}"
MONGO_DB="${MONGO_DB:-homepage}"
MONGO_CONTAINER="${MONGO_CONTAINER:-homepage-mongo}"

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 <path-to.archive.gz>" >&2
  exit 1
fi

echo "About to restore '$ARCHIVE' into DB '$MONGO_DB' (existing collections will be dropped)."
read -r -p "Type 'yes' to continue: " ans
[ "$ans" = "yes" ] || { echo "Aborted."; exit 0; }

docker exec -i "$MONGO_CONTAINER" mongorestore \
  --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin \
  --archive --gzip --drop --nsInclude "${MONGO_DB}.*" < "$ARCHIVE"

echo "Restore complete."
