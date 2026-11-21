#!/usr/bin/env bash
# Runs the actual migration and SQL rules only in a disposable local PostgreSQL instance.
set -euo pipefail
ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
TMP="$(mktemp -d /tmp/whatsapp-pg.XXXXXX)"
PORT=55491
PG_OWNER="$(id -un)"
AS_OWNER=()
if [[ $(id -u) -eq 0 ]]; then
  PG_OWNER="${PG_TEST_USER:-nobody}"
  chown "$PG_OWNER" "$TMP"
  AS_OWNER=(setpriv --reuid "$PG_OWNER" --regid "$(id -g "$PG_OWNER")" --clear-groups)
fi
cleanup() {
  "${AS_OWNER[@]}" pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
"${AS_OWNER[@]}" initdb -D "$TMP/data" -A trust --no-locale >/dev/null
"${AS_OWNER[@]}" pg_ctl -D "$TMP/data" -l "$TMP/server.log" -o "-k $TMP -p $PORT -h ''" start >/dev/null
PSQL=(psql -X -h "$TMP" -p "$PORT" -U "$PG_OWNER" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/whatsapp_recovery_fixture.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261121201000_whatsapp_recovery.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/tests/whatsapp_recovery.sql"
