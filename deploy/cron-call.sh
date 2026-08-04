#!/bin/sh
# Call a Pharos scheduler endpoint (/api/cron/saas/<endpoint>) authenticated with CRON_SECRET.
#
# WHY THIS EXISTS: the token used to sit inline in the root crontab as
#   curl -H "Authorization: Bearer <token>" ...
# `ps` shows every process argv to every local user, so the secret was readable for as long
# as the request ran, and it was a second copy of a value that already has a proper 600 home
# in deploy/.env.prod. Here the token is read from that one home and handed to curl through
# its config file on STDIN (`-K -`), so it never becomes a command-line argument.
set -eu

ENV_FILE=/opt/pharos/deploy/.env.prod
ENDPOINT=${1:?usage: cron-call.sh <endpoint>   e.g. usage-sample}

[ -r "$ENV_FILE" ] || { echo "cron-call: cannot read $ENV_FILE" >&2; exit 1; }

# Extract only CRON_SECRET rather than sourcing the file: .env.prod is docker-compose env
# syntax, not shell, and sourcing it would execute whatever a value happens to contain.
SECRET=$(sed -n "s/^CRON_SECRET=//p" "$ENV_FILE" | head -1)
[ -n "$SECRET" ] || { echo "cron-call: CRON_SECRET is empty or missing in $ENV_FILE" >&2; exit 1; }

printf "header = \"Authorization: Bearer %s\"\n" "$SECRET" |
  curl -K - -fsS -X POST "https://app.ph-aros.com/api/cron/saas/$ENDPOINT"
