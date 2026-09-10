#!/usr/bin/env bash
# Build + validação + publicação atômica do frontend na VPS.
# Nunca publica bundle sem anon key ou com URL Lovable.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/comandatech}"
STAGING="${APP_DIR}/dist-staging"
LIVE="${APP_DIR}/dist"

cd "$APP_DIR"

# Garante .env de produção (fallback se .env local ausente)
if [[ ! -f .env.production ]] && [[ -f .env.production.local ]]; then
  cp .env.production.local .env.production
fi
if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

if [[ -z "${VITE_SUPABASE_URL:-}" ]] || [[ -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "ERRO: VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY ausente" >&2
  exit 1
fi
if echo "$VITE_SUPABASE_URL" | grep -q 'api.comandatech.com.br'; then
  echo "ERRO: VITE_SUPABASE_URL aponta para VPS API (use Lovable Cloud)" >&2
  exit 1
fi
if ! echo "$VITE_SUPABASE_URL" | grep -qE 'iwmrtxdzlkasuzutxvhh|\.supabase\.co'; then
  echo "ERRO: VITE_SUPABASE_URL deve ser iwmrtxdzlkasuzutxvhh.supabase.co" >&2
  exit 1
fi

echo "==> Build (URL=$VITE_SUPABASE_URL)"
export VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY
export VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-iwmrtxdzlkasuzutxvhh}"

if command -v bun >/dev/null 2>&1; then
  bun run build
elif command -v npm >/dev/null 2>&1; then
  npm run build
else
  echo "ERRO: bun ou npm necessário" >&2
  exit 1
fi

echo "==> Validar bundle"
node scripts/validate-bundle.mjs

echo "==> Publicar (staging → live)"
rm -rf "$STAGING"
cp -a dist "$STAGING"
# Atomic-ish: sync staging into live without deleting live first on failure
mkdir -p "$LIVE"
rsync -a --delete "$STAGING/" "$LIVE/"

echo "==> Smoke test local"
node scripts/validate-prod-bundle.mjs

systemctl reload nginx
echo "==> Deploy frontend OK"
