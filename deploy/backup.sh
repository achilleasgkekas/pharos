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
#
# ── Backing up MORE THAN ONE instance on the same host ──────────────────────────────────────
# Everything the script targets is overridable, because a box very often runs a second Pharos
# next to the hosted one (a self-hosted instance for your own data, a staging copy). Backing up
# only the stack this file happens to sit in is how you end up with nightly backups of the empty
# one. Same MONGO_CONTAINER idiom as restore.sh.
#
#   ENV_FILE          env file to source for MONGO_PASSWORD etc.  (default deploy/.env.prod)
#   MONGO_CONTAINER   container to dump                           (default pharos-mongo)
#   STORAGE_DIR       files directory to archive                  (default deploy/storage)
#   BACKUP_LABEL      infix so two instances do not collide       (default none)
#
# And one of these decides where the offsite copy goes (first one set wins):
#   BACKUP_SSH        user@host:dir for rsync over SSH             (preferred; key auth)
#   BACKUP_COPY_DIR   a MOUNTED directory to copy into             (NAS share, USB disk)
#   BACKUP_REMOTE     an rclone remote
#
# e.g. a second instance living in /opt/pharos-local:
#   ENV_FILE=/opt/pharos-local/.env MONGO_CONTAINER=pharos-local-mongo \
#     STORAGE_DIR=/opt/pharos-local/storage BACKUP_LABEL=local deploy/backup.sh
#
# BACKUP_LABEL only changes the FILENAME infix (mongo-local-<stamp>.archive.gz). Local retention
# and the offsite prune both still recognise those, so a labelled run ages out like any other.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

ENV_FILE="${ENV_FILE:-$HERE/.env.prod}"
[ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR:-$HERE/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
MONGO_USER="${MONGO_USER:-pharos}"
MONGO_CONTAINER="${MONGO_CONTAINER:-pharos-mongo}"
STORAGE_DIR="${STORAGE_DIR:-$HERE/storage}"
# Trailing dash only when a label is actually set, so the default names are byte-identical to
# what every earlier backup, the retention find and restore.sh already expect.
LABEL="${BACKUP_LABEL:+${BACKUP_LABEL}-}"
mkdir -p "$OUT"

DUMP="$OUT/mongo-$LABEL$STAMP.archive.gz"
FILES="$OUT/storage-$LABEL$STAMP.tar.gz"

echo "[1/4] dumping every database from $MONGO_CONTAINER"
# --archive to stdout so nothing is written inside the container. --gzip halves the size of a
# dump that is mostly repetitive BSON.
docker exec "$MONGO_CONTAINER" mongodump \
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
if ! docker exec -i "$MONGO_CONTAINER" mongorestore \
      --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
      --archive --gzip --dryRun --quiet \
      --nsExclude 'admin.*' --nsExclude 'config.*' < "$DUMP"; then
  echo "FATAL: dump failed a dry-run restore — it would NOT restore" >&2; exit 1
fi

echo "[3/4] archiving $STORAGE_DIR"
# Archived as a plain `storage/` entry regardless of where it lives on disk, so restore.sh can
# unpack any instance's archive into whichever directory it is pointed at.
[ -d "$STORAGE_DIR" ] || { echo "FATAL: storage dir not found: $STORAGE_DIR" >&2; exit 1; }
tar -czf "$FILES" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

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
            # Optional BACKUP_LABEL between the kind and the stamp (mongo-local-2026...).
            # The date is pulled out by MATCHING the stamp rather than by stripping prefixes:
            # the old strip-one-prefix version turned "mongo-local-20260828-.." into "local",
            # which compares greater than any cutoff, so labelled files were never pruned and
            # the remote would have filled up silently.
            /^(mongo|storage)-([a-z0-9]+-)?[0-9]{8}-[0-9]{6}\./ {
              if (match($0, /[0-9]{8}-[0-9]{6}/)) {
                d = substr($0, RSTART, 8)
                if (d < c) print
              }
            }')"
  if [ -n "$OLD" ]; then
    # One session, one rm per file, quoted paths.
    CMD=""; for f in $OLD; do CMD="$CMD rm $REMOTE_DIR/$f;"; done
    $SSH_OPTS "$REMOTE_HOST" "$CMD" >/dev/null 2>&1 || echo "  (remote prune failed, not fatal)"
    echo "  pruned $(echo "$OLD" | wc -w | tr -d ' ') old file(s) offsite"
  fi
  echo "  -> $BACKUP_SSH"
elif [ -n "${BACKUP_COPY_DIR:-}" ]; then
  # A plain directory that is NOT this disk: an SMB/NFS share from a NAS, an attached USB disk.
  # The dependency-free option when the destination speaks neither SSH nor rclone (a Synology
  # with only SMB enabled, say) — rsync-over-ssh stays preferable where it is available, because
  # this one is only as good as the mount underneath it.
  #
  # `mountpoint` is the whole safety property here, and it is not paranoia: if the share is not
  # mounted, $BACKUP_COPY_DIR is just an empty directory on the SAME disk as the data. The copy
  # would succeed, the script would exit 0, and the backups would quietly be protecting nothing
  # while looking perfectly healthy. Refuse instead.
  if ! mountpoint -q "$BACKUP_COPY_DIR" 2>/dev/null; then
    echo "FATAL: BACKUP_COPY_DIR ($BACKUP_COPY_DIR) is not a mount point — the share is not" >&2
    echo "       mounted, so copying there would leave the backups on the same disk as the data." >&2
    exit 1
  fi
  cp -f "$DUMP" "$FILES" "$BACKUP_COPY_DIR/" || {
    echo "FATAL: offsite copy FAILED — the local copy exists but is not protected" >&2; exit 1
  }
  # Read one back rather than trusting cp's exit code: a full or flaky share can accept the write
  # and hand you a truncated file, which is the failure you would only find during a restore.
  if ! gzip -t "$BACKUP_COPY_DIR/$(basename "$DUMP")" 2>/dev/null; then
    echo "FATAL: the copy at $BACKUP_COPY_DIR is not a readable archive" >&2; exit 1
  fi
  find "$BACKUP_COPY_DIR" -maxdepth 1 -name 'mongo-*.archive.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
  find "$BACKUP_COPY_DIR" -maxdepth 1 -name 'storage-*.tar.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
  echo "  -> $BACKUP_COPY_DIR (verified readable)"
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
  echo "  !! dependencies), BACKUP_COPY_DIR (a mounted share) or BACKUP_REMOTE (rclone)."
fi

find "$OUT" -name 'mongo-*.archive.gz' -mtime "+$KEEP_DAYS" -delete
find "$OUT" -name 'storage-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "done: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)), $(basename "$FILES") ($(du -h "$FILES" | cut -f1))"
