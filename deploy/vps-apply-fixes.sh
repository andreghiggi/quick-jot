#!/usr/bin/env bash
# Aplica correções de infra + frontend na VPS ComandaTech.
# Executar como root em /opt/apps/comandatech-api/supabase e /var/www/comandatech
set -euo pipefail

SUPABASE_DIR="${SUPABASE_DIR:-/opt/apps/comandatech-api/supabase}"
APP_DIR="${APP_DIR:-/var/www/comandatech}"
REPO_DEPLOY="${REPO_DEPLOY:-$APP_DIR/deploy}"

echo "==> 1) Realtime: garantir schema + ANON_KEY no compose"
docker exec supabase-db-1 psql -U postgres -d postgres -c \
  "CREATE SCHEMA IF NOT EXISTS _realtime; GRANT ALL ON SCHEMA _realtime TO supabase_admin; GRANT USAGE ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;" \
  2>/dev/null || true

if [[ -f "$REPO_DEPLOY/docker/docker-compose.vps.yml" ]]; then
  cp "$REPO_DEPLOY/docker/docker-compose.vps.yml" "$SUPABASE_DIR/docker-compose.yml"
fi

grep -q '^SECRET_KEY_BASE=' "$SUPABASE_DIR/.env" || \
  echo "SECRET_KEY_BASE=$(openssl rand -base64 48)" >> "$SUPABASE_DIR/.env"

cd "$SUPABASE_DIR"
docker compose up -d realtime
docker compose restart auth rest functions storage realtime

echo "==> 2) Nginx API (realtime websocket)"
if [[ -f "$REPO_DEPLOY/nginx/api.comandatech.com.br.conf" ]]; then
  cp "$REPO_DEPLOY/nginx/api.comandatech.com.br.conf" /etc/nginx/sites-enabled/api.comandatech.com.br.conf
  nginx -t && systemctl reload nginx
fi

echo "==> 3) Migrations NFC-e (idempotente)"
for mig in \
  "$APP_DIR/supabase/migrations/20260909000000_nfce_records_unique_external_id.sql" \
  "$APP_DIR/supabase/migrations/20260909120000_nfce_contingencia_cron_vps.sql" \
  "$APP_DIR/supabase/migrations/20260909135000_nfce_dedup_sale_id_before_index.sql" \
  "$APP_DIR/supabase/migrations/20260909140000_nfce_records_unique_sale_id.sql"; do
  if [[ -f "$mig" ]]; then
    base=$(basename "$mig")
    docker cp "$mig" "supabase-db-1:/tmp/$base"
    docker exec supabase-db-1 psql -U postgres -d postgres -f "/tmp/$base" || true
  fi
done

echo "==> 4) Edge functions (nfce-proxy timeout 35s)"
if [[ -d "$APP_DIR/supabase/functions" ]]; then
  rsync -a --delete --exclude main/ "$APP_DIR/supabase/functions/" "$SUPABASE_DIR/functions/"
  if [[ -d "$REPO_DEPLOY/supabase/functions/main" ]]; then
    rsync -a "$REPO_DEPLOY/supabase/functions/main/" "$SUPABASE_DIR/functions/main/"
  fi
  docker compose restart functions
fi

echo "==> 5) Build frontend"
cd "$APP_DIR"
if command -v bun >/dev/null 2>&1; then
  bun run build
elif command -v npm >/dev/null 2>&1; then
  npm run build
else
  echo "ERRO: bun ou npm não encontrado" >&2
  exit 1
fi

echo "==> 6) Cron host: nfce-contingencia-sync (fallback se pg_cron indisponível)"
CRON_LINE='*/10 * * * * curl -s -X POST https://api.comandatech.com.br/functions/v1/nfce-contingencia-sync -H '"'"'Content-Type: application/json'"'"' -d '"'"'{}'"'"' >/dev/null 2>&1'
( crontab -l 2>/dev/null | grep -v nfce-contingencia-sync || true; echo "$CRON_LINE" ) | crontab -

echo "==> 7) Reconciliar NFC-e órfãs"
if [[ -f "$APP_DIR/scripts/reconcile-nfce-orphans.mjs" ]]; then
  SUPABASE_URL="${SUPABASE_URL:-https://api.comandatech.com.br}" \
  node "$APP_DIR/scripts/reconcile-nfce-orphans.mjs" || true
fi

echo "==> 8) Health checks"
ANON_KEY="$(grep '^ANON_KEY=' "$SUPABASE_DIR/.env" | cut -d= -f2-)"
curl -s -o /dev/null -w "auth:%{http_code}\n" -X POST "https://api.comandatech.com.br/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"invalid@test.com","password":"wrong"}' || true
curl -s -o /dev/null -w "realtime:%{http_code}\n" \
  -H "Authorization: Bearer $ANON_KEY" \
  "http://127.0.0.1:54325/api/tenants/realtime-dev/health" || true

docker ps --format 'table {{.Names}}\t{{.Status}}'
echo "Deploy concluído."
