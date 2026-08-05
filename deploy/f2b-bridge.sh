#!/bin/sh
# Pharos fail2ban bridge. Runs from cron every minute.
#
# Two jobs, both deliberately ONE-WAY:
#   1. export -> writes f2b/state.json, the only thing the app ever reads
#   2. drain  -> executes unban requests the app queued as plain files
#
# The container NEVER executes anything and never talks to the fail2ban socket.
# That socket can define actions, i.e. arbitrary commands run as root, so handing
# it to a web app that accepts anonymous POSTs would turn any RCE into host root.
# The app only asks; this script decides.
#
# Validation here is the AUTHORITATIVE one. The app is not trusted, on purpose.
#
# Request format is one line of plain text, NOT json:
#     unban <jail> <ip>
# Deliberate: json parsing in shell without jq is fragile, and this needs to be
# boringly robust rather than clever.
set -eu

BASE=/opt/pharos/deploy/f2b
REQ="$BASE/requests"
DONE="$BASE/done"
REJ="$BASE/rejected"
STATE="$BASE/state.json"

ALLOWED_JAILS="sshd"
MAX_PER_RUN=20
MAX_AGE_SEC=3600

mkdir -p "$REQ" "$DONE" "$REJ"

# ---------------------------------------------------------------- 1. export
# Written atomically (temp + mv) so the app can never read a half-written file.
# `generatedAt` exists so the UI can tell "nothing is banned" apart from "the
# bridge is dead". An empty list that is silently stale reads as reassuring and
# would be a lie.
tmp=$(mktemp "$BASE/.state.XXXXXX")
{
  printf '{\n'
  printf '  "generatedAt": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "jails": {\n'
  jail_n=0
  for jail in $ALLOWED_JAILS; do
    [ "$jail_n" -eq 0 ] || printf ',\n'
    jail_n=1
    printf '    "%s": ' "$jail"
    fail2ban-client get "$jail" banip --with-time 2>/dev/null | awk -F'\t' '
      BEGIN { printf "["; n = 0 }
      {
        ip = $1
        gsub(/^[ \t]+|[ \t]+$/, "", ip)
        # Only emit things that actually look like an address, so a future change
        # in fail2ban output cannot inject junk into the json.
        if (ip !~ /^[0-9a-fA-F.:]+$/ || ip == "") next
        rest = $2
        bannedAt = ""; until_ = ""
        if (match(rest, /[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/)) {
          bannedAt = substr(rest, RSTART, RLENGTH)
        }
        if (match(rest, /= [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/)) {
          until_ = substr(rest, RSTART + 2, RLENGTH - 2)
        }
        if (n++) printf ","
        printf "{\"ip\":\"%s\",\"bannedAt\":\"%s\",\"until\":\"%s\"}", ip, bannedAt, until_
      }
      END { printf "]" }
    '
  done
  printf '\n  }\n}\n'
} > "$tmp"
chmod 644 "$tmp"
mv -f "$tmp" "$STATE"

# ----------------------------------------------------------------- 2. drain
# Capped per run so a broken or hostile app cannot make this loop forever.
now=$(date +%s)
count=0

for f in "$REQ"/*; do
  [ -e "$f" ] || break
  count=$((count + 1))
  if [ "$count" -gt "$MAX_PER_RUN" ]; then
    logger -t f2b-bridge "cap of $MAX_PER_RUN reached, deferring the rest to next run"
    break
  fi

  base=$(basename "$f")

  reject() {
    # Rejections are recorded WITH the reason. A silent drop would look exactly
    # like "I pressed the button and nothing happened".
    printf '%s\treason=%s\tcontent=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$(head -c 200 "$f" 2>/dev/null | tr -d '\n')" \
      >> "$REJ/rejected.log"
    rm -f "$f"
    logger -t f2b-bridge "rejected $base: $1"
  }

  # Age: a request that sat around is not acted on. Bans expire by themselves.
  mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
  if [ "$((now - mtime))" -gt "$MAX_AGE_SEC" ]; then reject "too_old"; continue; fi

  # Exactly one line, three fields. Anything else is malformed by definition.
  lines=$(wc -l < "$f" 2>/dev/null || echo 99)
  if [ "$lines" -gt 1 ]; then reject "multiline"; continue; fi

  read -r action jail ip extra < "$f" 2>/dev/null || { reject "unreadable"; continue; }

  [ -z "${extra:-}" ] || { reject "extra_fields"; continue; }

  # The action can ONLY ever be unban. This script must never be a way to ban.
  [ "${action:-}" = "unban" ] || { reject "bad_action"; continue; }

  # Jail must be on the allowlist, not merely "a jail that exists".
  ok_jail=0
  for j in $ALLOWED_JAILS; do [ "$jail" = "$j" ] && ok_jail=1; done
  [ "$ok_jail" -eq 1 ] || { reject "bad_jail"; continue; }

  # Strict address shape. This is what stops anything clever in the ip field
  # from reaching the command line.
  if ! printf '%s' "$ip" | grep -qE '^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$|^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$'; then
    reject "bad_ip"; continue
  fi

  if fail2ban-client set "$jail" unbanip "$ip" >/dev/null 2>&1; then
    logger -t f2b-bridge "unbanned $ip from $jail"
  else
    # Already expired on its own is the common case, not an error worth shouting about.
    logger -t f2b-bridge "unban of $ip from $jail returned non-zero (likely already unbanned)"
  fi
  mv -f "$f" "$DONE/$base"
done

# Keep the archive from growing without bound.
find "$DONE" -type f -mtime +7 -delete 2>/dev/null || true
