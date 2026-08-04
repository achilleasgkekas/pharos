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
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
COMPOSE="docker compose -f $HERE/docker-compose.prod.yml --env-file $HERE/.env.prod"
APEX="https://ph-aros.com"
APP="https://app.ph-aros.com"

say() { printf '%s\n' "$*"; }

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
    # Mongo is not public, so ask Docker instead of the network.
    [ "$(docker inspect pharos-mongo --format '{{.State.Health.Status}}' 2>/dev/null)" = healthy ] || rc=1
    for c in pharos-web pharos-landing pharos-caddy; do
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

# A dirty tree means someone edited files on the server. Rolling back with `git checkout` would
# silently discard that work, so stop instead.
if [ -n "$(git status --porcelain)" ]; then
  say "REFUSING: the working tree on the server has uncommitted changes. Rollback would discard"
  say "them. Commit or clean them first:"
  git status --short | head -10
  exit 1
fi

say "[2/6] backup (a deploy is the likeliest moment to need one)"
if ! "$HERE/backup.sh" >/tmp/pharos-deploy-backup.log 2>&1; then
  say "REFUSING: backup failed, so there would be nothing to restore from. Last lines:"
  tail -5 /tmp/pharos-deploy-backup.log
  exit 1
fi
say "  backup ok"

OLD="$(git rev-parse HEAD)"
say "[3/6] current commit recorded: ${OLD:0:8}"

say "[4/6] pull"
git fetch origin --quiet
NEW="$(git rev-parse origin/main)"
if [ "$OLD" = "$NEW" ]; then
  say "  already at origin/main — nothing to deploy"
  exit 0
fi
say "  shipping $(git log --oneline "$OLD..$NEW" | wc -l | tr -d ' ') commit(s):"
git log --oneline "$OLD..$NEW" | sed 's/^/    /'
git merge --ff-only origin/main --quiet || { say "REFUSING: cannot fast-forward"; exit 1; }

# Only rebuild what actually changed. A landing tweak should not spend minutes rebuilding the app
# on a two-core box, and every minute of build is a minute the deploy can be interrupted in.
CHANGED="$(git diff --name-only "$OLD" "$NEW")"
SERVICES=""
grep -q '^apps/web/'      <<<"$CHANGED" && SERVICES="$SERVICES web"
grep -q '^apps/landing/'  <<<"$CHANGED" && SERVICES="$SERVICES landing"
grep -q '^deploy/'        <<<"$CHANGED" && SERVICES="$SERVICES caddy"
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
  say "DEPLOYED: ${OLD:0:8} → ${NEW:0:8}, healthy"
  exit 0
fi

say "UNHEALTHY after deploy — rolling back to ${OLD:0:8}"
git checkout --quiet "$OLD" || { say "ROLLBACK FAILED: cannot check out $OLD"; exit 3; }
# shellcheck disable=SC2086
$COMPOSE up -d --build ${SERVICES:-} >/dev/null 2>&1
if health 12; then
  say "ROLLED BACK to ${OLD:0:8} and healthy. The new commits are broken:"
  git log --oneline "$OLD..$NEW" | sed 's/^/    /'
  exit 2
fi
say "ROLLBACK FAILED — PRODUCTION IS DOWN. Manual intervention needed."
exit 3
