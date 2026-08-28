#!/usr/bin/env bash
# Restore a Pharos backup produced by deploy/backup.sh.
#
#   deploy/restore.sh backups/mongo-20260804-030000.archive.gz [backups/storage-20260804-030000.tar.gz]
#
# READ THIS BEFORE RUNNING IT ON PRODUCTION. `--drop` replaces each collection in the archive
# with the backed-up copy, so anything created after the backup was taken is gone. That is what
# you want when recovering from data loss and catastrophic when you are "just checking that the
# backup works". To check the backup works, point a SCRATCH stack at it instead:
#
#   docker compose -f docker-compose.saas-dev.yml up -d      # separate project, separate volume
#   MONGO_CONTAINER=pharos-saas-mongo MONGO_USER=admin MONGO_PASSWORD=devlocal \
#     deploy/restore.sh backups/mongo-XXXX.archive.gz
#
# and then look at the data. Restoring into the scratch stack cannot touch production, because it
# is a different container with a different volume.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP="${1:?usage: restore.sh <mongo-*.archive.gz> [storage-*.tar.gz]}"
FILES="${2:-}"

CONTAINER="${MONGO_CONTAINER:-pharos-mongo}"
# Where the storage archive is unpacked. It must be the PARENT of the bind-mounted `storage`
# directory, because the archive holds a plain `storage/` entry. Overridable for the same reason
# MONGO_CONTAINER is: a host can run a second Pharos whose files live somewhere else entirely
# (e.g. STORAGE_PARENT=/opt/pharos-local for a self-hosted instance next to the hosted one).
STORAGE_PARENT="${STORAGE_PARENT:-$HERE}"
ENV_FILE="${ENV_FILE:-$HERE/.env.prod}"
if [ -z "${MONGO_PASSWORD:-}" ] && [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
USER_="${MONGO_USER:-pharos}"

[ -f "$DUMP" ] || { echo "no such archive: $DUMP" >&2; exit 1; }

echo "About to restore into container '$CONTAINER' with --drop."
echo "Every collection present in the archive will be REPLACED."
printf 'Type the container name to confirm: '
read -r answer
[ "$answer" = "$CONTAINER" ] || { echo "aborted"; exit 1; }

echo "[1/2] restoring databases"
# --nsExclude admin/config is NOT cosmetic, and this was found by actually running a restore.
# mongodump has no way to exclude a database, so the archive always contains `admin`, including
# admin.system.users. Restoring that replaces the target's user catalogue MID-STREAM, which
# invalidates the session mongorestore is currently authenticated with. The visible result is
# "63 documents restored successfully" followed by every createIndexes failing Unauthorized —
# a restore that looks like it worked and silently leaves the database with NO indexes. Missing
# unique indexes are the dangerous part: nothing then stops duplicate workspace slugs.
docker exec -i "$CONTAINER" mongorestore \
  --username "$USER_" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  --archive --gzip --drop \
  --nsExclude 'admin.*' --nsExclude 'config.*' < "$DUMP"

echo "  verifying indexes came back (a restore without them is not a restore)"
docker exec "$CONTAINER" mongosh --quiet \
  -u "$USER_" -p "$MONGO_PASSWORD" --authenticationDatabase admin pharos_registry --eval '
  const missing = ["tenants","accounts","memberships"].filter(c => db.getCollection(c).getIndexes().length <= 1);
  if (missing.length) { print("WARNING: no secondary indexes on: " + missing.join(", ")); quit(1); }
  print("  ok: " + db.tenants.getIndexes().length + " indexes on tenants, " + db.accounts.getIndexes().length + " on accounts");'

if [ -n "$FILES" ]; then
  echo "[2/2] restoring storage into $STORAGE_PARENT"
  [ -f "$FILES" ] || { echo "no such archive: $FILES" >&2; exit 1; }
  [ -d "$STORAGE_PARENT" ] || { echo "no such directory: $STORAGE_PARENT" >&2; exit 1; }
  # Extracted alongside the compose file, which is where the bind mount points. Existing files
  # are overwritten; files added since the backup are left in place rather than deleted, because
  # an unexpected extra receipt is a much smaller problem than a deleted one.
  tar -xzf "$FILES" -C "$STORAGE_PARENT"
else
  echo "[2/2] no storage archive given — databases restored, FILES NOT restored."
  echo "     Receipts and statements will 404 until you restore the matching storage-*.tar.gz."
fi

echo "done. Restart the app so it reconnects: docker compose -f deploy/docker-compose.prod.yml restart web"
