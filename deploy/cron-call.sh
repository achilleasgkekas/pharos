#!/bin/sh
# Call a self-hosted scheduler without putting its secret in process arguments.
# Usage: PHAROS_URL=https://pharos.example.com ENV_FILE=/path/to/.env cron-call.sh alerts
set -eu

: "${ENV_FILE:?set ENV_FILE to your private environment file}"
: "${PHAROS_URL:?set PHAROS_URL to your own instance origin}"
ENDPOINT=${1:?usage: cron-call.sh alerts|prices}
case "$ENDPOINT" in alerts|prices) ;; *) echo 'cron-call: expected alerts or prices' >&2; exit 1 ;; esac
case "$PHAROS_URL" in http://*|https://*) ;; *) echo 'cron-call: PHAROS_URL must be http(s)' >&2; exit 1 ;; esac
[ -r "$ENV_FILE" ] || { echo 'cron-call: environment file is not readable' >&2; exit 1; }

# Read a value, never execute the environment file. Use an unquoted, single-line
# secret generated with openssl rand -base64 32 (or rand -hex 32).
SECRET=$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | head -1)
case "$SECRET" in ''|*[!A-Za-z0-9_+/=-]*) echo 'cron-call: missing or invalid CRON_SECRET' >&2; exit 1 ;; esac
printf 'header = "Authorization: Bearer %s"\n' "$SECRET" |
  curl -K - -fsS --max-time 300 -X POST "${PHAROS_URL%/}/api/cron/$ENDPOINT"
