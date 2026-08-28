#!/usr/bin/env bash
# Ship main to production, with a net under it.
#
#   deploy/deploy-update.sh --check     health only, changes nothing
#   deploy/deploy-update.sh             back up, pull, rebuild what changed, verify, roll back on failure
#
# ORDER MATTERS and it is not arbitrary:
#   1. health FIRST — never layer a deploy onto an already-broken site, or you cannot tell which
#      change broke it
#   2. backup, and REFUSE to continue if it fails — a deploy is the most likely moment to need one
#   3. record the current commit, so rollback is a fact rather than a guess
#   4. pull, rebuild ONLY the services whose files changed
#   5. verify the real public endpoints, with retries
#   6. on failure, roll back to the recorded commit and verify again
#
# EXIT CODES (the routine reads these):
#   0  deployed and healthy
#   1  refused to start (already unhealthy / backup failed / dirty tree)
#   2  deployed, health check failed, ROLLED BACK successfully — production is fine, the new
#      commits are broken. This is the most important one to report.
#   3  rollback ALSO failed. Production is down. Say so in plain language.
#   4  another deploy was already running (lock held). Nothing changed; retry next time.
set -uo pipefail

# ── single-writer lock ──────────────────────────────────────────────────────────────────────
# Two concurrent runs (a scheduled or manual deploy plus another) can interleave git reset, build
# and recreate, and ship an image built from a mixed set of commits. Serialise every invocation
# (including --check) behind one lock: a second run exits 4 and changes nothing. Mirrors the
# BakeCore deploy script, which already took this lock.
exec 200>/var/lock/pharos-deploy.lock
flock -n 200 || { printf '%s\n' "another deploy is already running (lock held); nothing changed, exit 4"; exit 4; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
COMPOSE="docker compose -f $HERE/docker-compose.prod.yml --env-file $HERE/.env.prod"
APEX="https://ph-aros.com"
APP="https://app.ph-aros.com"

say() { printf '%s\n' "$*"; }

# ── storage bind-mount ownership ───────────────────────────────────────────────────────────
# docker-compose.prod.yml bind-mounts ./storage (relative to $HERE) into the web container's
# /storage. When that host directory doesn't exist yet, Docker auto-creates it as root:root —
# the image's own `chown nextjs:nodejs /storage` (Dockerfile) only sets ownership INSIDE the
# image layer, which a runtime bind mount shadows entirely. Result: the app (uid 1001) gets
# EACCES on every upload ("Failed to save file: EACCES: permission denied, mkdir
# '/storage/receipts'") until someone notices and fixes it by hand. Self-heals here on every
# deploy instead: idempotent, costs nothing once correct, and survives a host rebuild or a
# fresh volume without needing a manual chown again. 1001 mirrors the image's `nextjs` user.
mkdir -p "$HERE/storage"
chown -R 1001:1001 "$HERE/storage" 2>/dev/null || true

# ── health ──────────────────────────────────────────────────────────────────────────────────
# Retries because a container that has just been recreated needs a moment; a single probe would
# report a healthy deploy as broken and trigger a pointless rollback.
health() {
  local tries="${1:-10}" i rc=1
  for ((i = 1; i <= tries; i++)); do
    rc=0
    local apex_body
    apex_body="$(curl -fsS --max-time 15 "$APEX/" 2>/dev/null)" || rc=1
    # The apex must serve the LANDING, not the app. Checking only the status code misses a routing
    # regression entirely — both upstreams answer 200, and they even share a <title>, so this
    # looks for content only the marketing site has.
    grep -q 'waitlist\|self-host' <<<"$apex_body" || rc=1
    curl -fsS --max-time 15 -o /dev/null "$APP/account/login" || rc=1
    # The cron endpoints must stay shut to the public internet. A deploy that breaks their token
    # check leaves an unauthenticated write endpoint exposed while every other probe here still
    # passes, so this asserts the rejection itself.
    # POST, not GET: the route exports only POST, so a GET answers 405 and would "pass" a naive
    # status check while proving nothing. No -f either — 401 IS the expected answer, and -f would
    # turn the success case into a failure.
    [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST --max-time 15 \
      "$APP/api/cron/saas/trials-sweep" 2>/dev/null)" = 401 ] || rc=1
    # Mongo is not public, so ask Docker instead of the network.
    [ "$(docker inspect pharos-mongo --format '{{.State.Health.Status}}' 2>/dev/null)" = healthy ] || rc=1
    # Only the containers THIS stack owns. The edge (the shared `caddy` + `cloudflared`, which
    # front BakeCore and the homelab too) is deliberately not asserted here: the three public
    # probes above already prove the whole path through it, and coupling a Pharos deploy to
    # containers this repo does not manage would refuse deploys over somebody else's change.
    # This used to also assert `pharos-caddy`, which stopped existing when production moved to
    # the shared proxy — so --check returned 1 for weeks while the site was perfectly healthy.
    for c in pharos-web pharos-landing; do
      [ "$(docker inspect "$c" --format '{{.State.Running}}' 2>/dev/null)" = true ] || rc=1
    done
    [ $rc -eq 0 ] && { say "  health: OK (attempt $i)"; return 0; }
    sleep 6
  done
  say "  health: FAILED after $tries attempts"
  return 1
}

if [ "${1:-}" = "--check" ]; then
  health 3 && exit 0 || exit 1
fi

cd "$REPO"

say "[1/6] pre-flight health"
if ! health 3; then
  say "REFUSING: production is already unhealthy. Fix that first — deploying now would hide which"
  say "change is at fault."
  exit 1
fi

# Someone editing TRACKED files on the server is the case worth refusing: the rollback's
# `git checkout` would silently discard that work. UNTRACKED files are a different story — neither
# `git merge --ff-only` nor `git checkout` touches them, so they are never at risk, and refusing
# over them blocks deploys for no gain. That is not hypothetical: a copy from a Mac left ~1300
# AppleDouble `._*` files plus a `.vite/` cache in /opt/pharos, and this guard treated that junk
# as unsaved work and blocked every deploy.
DIRTY_TRACKED="$(git status --porcelain --untracked-files=no)"
if [ -n "$DIRTY_TRACKED" ]; then
  say "REFUSING: tracked files have been modified on the server. Rollback would discard those"
  say "changes. Commit or restore them first:"
  head -10 <<<"$DIRTY_TRACKED"
  exit 1
fi
UNTRACKED_N="$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')"
[ "$UNTRACKED_N" -gt 0 ] && say "  note: $UNTRACKED_N untracked file(s) present; left alone (never touched by pull or rollback)"

say "[2/6] backup (a deploy is the likeliest moment to need one)"
if ! "$HERE/backup.sh" >/tmp/pharos-deploy-backup.log 2>&1; then
  say "REFUSING: backup failed, so there would be nothing to restore from. Last lines:"
  tail -5 /tmp/pharos-deploy-backup.log
  exit 1
fi
say "  backup ok"

# What the RUNNING CONTAINERS were built from, which is not the same thing as HEAD. Anyone who
# pulls by hand — to recover a file, to look at something — moves HEAD forward and leaves the
# images behind, and comparing HEAD to origin/main then reports "nothing to deploy" while the
# site serves the old build. That happened twice in one day, once on this script's first run and
# once while recovering a file the guard routine had written. HEAD is only the fallback, for the
# very first run on a machine that has no stamp yet.
STAMP="$HERE/.deployed"
OLD="$( [ -r "$STAMP" ] && cat "$STAMP" || git rev-parse HEAD )"
git cat-file -e "${OLD}^{commit}" 2>/dev/null || OLD="$(git rev-parse HEAD)"
say "[3/6] currently deployed: ${OLD:0:8}"

say "[4/6] pull"
git fetch origin --quiet
NEW="$(git rev-parse origin/main)"
if [ "$OLD" = "$NEW" ]; then
  # "git is up to date" is NOT the same as "the running containers match the checkout". Anyone who
  # pulled by hand before running this leaves the code on disk and the old image serving — which
  # happened on the very first run of this script. Without --force we would report success and
  # change nothing, which is the worst possible answer.
  if [ "${FORCE:-}" != "1" ]; then
    say "  already at origin/main — nothing to pull."
    say "  If the containers are behind the checkout (e.g. someone pulled by hand), rerun with:"
    say "    FORCE=1 $0"
    exit 0
  fi
  say "  already at origin/main, but FORCE=1 — rebuilding everything anyway"
  FORCE_ALL=1
fi
say "  shipping $(git log --oneline "$OLD..$NEW" | wc -l | tr -d ' ') commit(s):"
git log --oneline "$OLD..$NEW" | sed 's/^/    /'
git merge --ff-only origin/main --quiet || { say "REFUSING: cannot fast-forward"; exit 1; }

# Only rebuild what actually changed. A landing tweak should not spend minutes rebuilding the app
# on a two-core box, and every minute of build is a minute the deploy can be interrupted in.
CHANGED="$(git diff --name-only "$OLD" "$NEW")"
# NEWLINE-separated, because the greps below are anchored to the start of a LINE. As a
# space-separated string this matched only the first entry, so FORCE=1 announced "rebuilding
# everything" and rebuilt web alone — leaving the landing site on its old build while reporting a
# healthy deploy. Same family as the two bugs above: the tool said it had done the work.
[ "${FORCE_ALL:-}" = "1" ] && CHANGED="$(printf 'apps/web/\napps/landing/\ndeploy/docker-compose.prod.yml')"
SERVICES=""
grep -q '^apps/web/'      <<<"$CHANGED" && SERVICES="$SERVICES web"
grep -q '^apps/landing/'  <<<"$CHANGED" && SERVICES="$SERVICES landing"
# A change to the compose file itself has to reach the running containers, so recreate both apps.
# This used to map ANY change under deploy/ to the `caddy` service — which on this host means
# pharos-caddy, now profile-gated precisely because it would fight the shared proxy for 80/443.
# Editing THIS script would have been enough to trigger that.
grep -q '^deploy/docker-compose.prod.yml' <<<"$CHANGED" && SERVICES="$SERVICES web landing"
SERVICES="$(tr ' ' '\n' <<<"$SERVICES" | sort -u | tr '\n' ' ' | sed 's/^ *//')"

say "[5/6] rebuilding:${SERVICES:- (nothing, config only)}"
# --force-recreate on caddy because its Caddyfile is a bind-mounted directory: without recreating,
# a config change can be served from a stale mount (this bit us once already).
if [ -n "$SERVICES" ]; then
  # shellcheck disable=SC2086
  $COMPOSE up -d --build $SERVICES || { say "  build FAILED"; DEPLOY_FAILED=1; }
else
  $COMPOSE up -d || true
fi

say "[6/6] verifying"
if [ -z "${DEPLOY_FAILED:-}" ] && health 12; then
  echo "$NEW" > "$STAMP"
  say "DEPLOYED: ${OLD:0:8} → ${NEW:0:8}, healthy"
  exit 0
fi

say "UNHEALTHY after deploy — rolling back to ${OLD:0:8}"
git checkout --quiet "$OLD" || { say "ROLLBACK FAILED: cannot check out $OLD"; exit 3; }
# shellcheck disable=SC2086
$COMPOSE up -d --build ${SERVICES:-} >/dev/null 2>&1
if health 12; then
  echo "$OLD" > "$STAMP"
  say "ROLLED BACK to ${OLD:0:8} and healthy. The new commits are broken:"
  git log --oneline "$OLD..$NEW" | sed 's/^/    /'
  exit 2
fi
say "ROLLBACK FAILED — PRODUCTION IS DOWN. Manual intervention needed."
exit 3
