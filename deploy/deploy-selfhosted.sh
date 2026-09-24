#!/usr/bin/env bash
# deploy-selfhosted.sh — ships main to the ONE remaining stack.
#
# Replaces deploy-both.sh, which ran deploy-update.sh first. That script health-checks,
# rebuilds and starts pharos-web:prod — the hosted stack, retired 2026-09-20 and deleted
# from Docker 2026-09-24. Running it now would resurrect it, which the owner directive in
# CLAUDE.md forbids. The git pull lived inside it, which is why /opt/pharos sat at an old
# commit while main moved on.
#
# Order matters: fetch, tag a way back, build, swap, verify, roll back if unhealthy.
set -uo pipefail
REPO=/opt/pharos
STACK=/opt/pharos-local
log() { printf "%s %s\n" "$(date +%H:%M:%S)" "$*"; }

# Every deploy tags the image it replaces as rollback-<sha>, ~620 MB each, and nothing ever
# removed them: on 2026-09-24 a busy day left nine behind and the next deploy stopped at the
# disk check below with 5 GB free. Only ONE is ever needed — the image serving right now,
# which is re-tagged rollback-$OLD a few lines further down, BEFORE the build starts. So every
# older rollback tag goes first, ahead of the disk check that would otherwise refuse the build.
# `docker rmi` of a tag only untags when another tag (pharos-web:local) still holds the image,
# so the running container's image is never removed.
prune_rollbacks() {
  docker images pharos-web --format '{{.Tag}}' | grep '^rollback-' |
    while read -r t; do docker rmi "pharos-web:$t" >/dev/null 2>&1 && log "pruned old rollback image $t"; done
}

# The whole body is one function, called on the last line. bash reads a script as it runs,
# and this one `git reset --hard`s its own file halfway through: whenever a commit changes
# the script, the running copy would carry on reading the NEW file from the OLD byte offset.
# A function is parsed completely before it starts, so the running deploy is immune.
main() {
# One deploy at a time. On 2026-09-24 two were started a minute apart: two parallel builds of
# the same commit, each needing ~6 GB on a disk with 8 GB free, both writing /tmp/deploy-sh.log.
exec 9>/tmp/deploy-selfhosted.lock
flock -n 9 || { log "ABORT: another deploy is already running (lock /tmp/deploy-selfhosted.lock)"; exit 6; }

# A build needs ~6 GB. The 2026-09-17 ENOSPC surfaced as "UNHEALTHY -> rolled back", which
# reads like broken code rather than a full disk, so refuse up front with the real reason.
prune_rollbacks
docker builder prune -af >/dev/null 2>&1; docker image prune -f >/dev/null 2>&1
FREE=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
log "free disk: ${FREE}GB"
[ "${FREE:-0}" -lt 6 ] && { log "ABORT: need ~6GB to build"; exit 5; }

# macOS metadata files ride in over rsync/scp and land in the build context, where next build
# lints them and dies with "Parsing error: Invalid character" (2026-09-17).
JUNK=$(find "$REPO" -name "._*" 2>/dev/null | wc -l)
[ "$JUNK" -gt 0 ] && { log "clearing $JUNK ._* files from the build context"; find "$REPO" -name "._*" -delete 2>/dev/null; }

cd "$REPO" || exit 1
OLD=$(git rev-parse --short HEAD)
git fetch -q origin && git reset -q --hard origin/main || { log "ABORT: fetch failed"; exit 1; }
NEW=$(git rev-parse --short HEAD)
log "source $OLD -> $NEW"
[ "$OLD" = "$NEW" ] && log "(no new commits; rebuilding anyway)"

# The way back: the image that is serving right now, whatever it is called.
docker tag pharos-web:local "pharos-web:rollback-$OLD" 2>/dev/null && log "rollback tag: pharos-web:rollback-$OLD"

log "building pharos-web:local ..."
docker build -f apps/web/Dockerfile --build-arg NODE_BUILD_MEMORY=3072 \
  -t pharos-web:local apps/web > /tmp/build-local.log 2>&1 || {
  log "ABORT: build failed - tail /tmp/build-local.log"; tail -5 /tmp/build-local.log; exit 2; }

cd "$STACK" && docker compose up -d web >/dev/null 2>&1

for i in 1 2 3 4 5 6; do
  sleep 10
  CODE=$(docker exec pharos-local-web wget -qO- --server-response http://localhost:3000/login 2>&1 | grep -m1 -oE "HTTP/1.1 [0-9]+" | grep -oE "[0-9]+$")
  [ "$CODE" = "200" ] && { log "healthy on attempt $i (HTTP $CODE)"; log "DEPLOYED: $OLD -> $NEW"; exit 0; }
  log "attempt $i: HTTP ${CODE:-none}"
done

log "UNHEALTHY - rolling back to $OLD"
docker tag "pharos-web:rollback-$OLD" pharos-web:local && docker compose up -d web >/dev/null 2>&1
sleep 10
docker exec pharos-local-web wget -qO- http://localhost:3000/login >/dev/null 2>&1 \
  && log "ROLLED BACK to $OLD, healthy" || log "ROLLED BACK to $OLD, STILL UNHEALTHY - needs a human"
exit 3
}

main "$@"
