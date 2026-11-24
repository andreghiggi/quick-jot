#!/usr/bin/env bash
set -euo pipefail
ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
TMP="$(mktemp -d /tmp/florist-pg.XXXXXX)"
PORT=55492
OWNER="$(id -un)"
AS_OWNER=()
if [[ $(id -u) -eq 0 ]]; then OWNER="${PG_TEST_USER:-lovable}"; chown "$OWNER" "$TMP"; AS_OWNER=(setpriv --reuid "$OWNER" --regid "$(id -g "$OWNER")" --clear-groups); fi
cleanup(){ "${AS_OWNER[@]}" pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"${AS_OWNER[@]}" initdb -D "$TMP/data" -A trust --no-locale >/dev/null
"${AS_OWNER[@]}" pg_ctl -D "$TMP/data" -l "$TMP/server.log" -o "-k $TMP -p $PORT -h ''" start >/dev/null
PSQL=(psql -X -h "$TMP" -p "$PORT" -U "$OWNER" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/florist_fixture.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/deploy/sql/2026-11-24_florist_fulfillments_auto.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/deploy/sql/2026-11-24_florist_notice_order_auto.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/tests/florist_fulfillments.sql" >/dev/null
# Two operators finish distinct final stages at the same time.
for pair in 'destino-2 delivered' 'destino-3 picked_up'; do
 read -r stage target <<< "$pair"
 "${PSQL[@]}" -c "SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false); SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','$stage','$target');" > "$TMP/$stage.log" 2>&1 &
done
wait
"${PSQL[@]}" -c "SELECT public.assert_test((SELECT status='delivered' FROM public.orders WHERE id='00000000-0000-0000-0000-000000000100'),'all stages complete the order'); SELECT public.assert_test((SELECT count(*)=1 FROM public.florist_notifications WHERE event='completed'),'concurrent final actions queue exactly one completion');" >/dev/null
"${PSQL[@]}" -c "DO \$\$ DECLARE n jsonb; BEGIN FOR i IN 1..10 LOOP n:=public.florist_claim_notice('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100'); EXIT WHEN n IS NULL; IF n->>'event'='completed' THEN PERFORM public.assert_test(NOT EXISTS(SELECT 1 FROM public.florist_notifications WHERE event<>'completed' AND status<>'accepted'),'completion claimed after all prior events'); END IF; PERFORM public.florist_finish_notice((n->>'id')::uuid,gen_random_uuid(),'accepted',NULL); PERFORM public.assert_test((SELECT status='sending' FROM public.florist_notifications WHERE id=(n->>'id')::uuid),'wrong lease cannot finish an event'); PERFORM public.florist_finish_notice((n->>'id')::uuid,(n->>'lease_token')::uuid,'accepted',NULL); END LOOP; END \$\$;" >/dev/null
echo 'Floral SQL and concurrent completion verified in a disposable database only.'