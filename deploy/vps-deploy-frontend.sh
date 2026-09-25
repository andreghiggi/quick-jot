#!/usr/bin/env bash
# Build + validação + publicação atômica do frontend na VPS.
# Nunca publica bundle sem anon key ou com URL Lovable.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/comandatech}"
STAGING="${APP_DIR}/dist-staging"
LIVE="${APP_DIR}/dist"

cd "$APP_DIR"

# .env local sobrescreve .env.production — isolar durante build de produção
if [[ -f .env ]]; then
  mv .env .env.vps-api-bak
  trap '[[ -f .env.vps-api-bak ]] && mv .env.vps-api-bak .env' EXIT
fi

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
if [[ "$VITE_SUPABASE_URL" != "https://api.comandatech.com.br" ]]; then
  echo "ERRO: VITE_SUPABASE_URL deve ser https://api.comandatech.com.br" >&2
  exit 1
fi

echo "==> Build (URL=$VITE_SUPABASE_URL)"
export VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY
export VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-comandatech-vps}"

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

echo "==> Publicar (staging → live, mantendo assets antigos por 24h)"
rm -rf "$STAGING"
cp -a dist "$STAGING"
# Atomic-ish: sync staging into live without deleting live first on failure
mkdir -p "$LIVE"
# 1) index.html e demais arquivos: atualizados imediatamente
rsync -a --delete --exclude '/assets/***' "$STAGING/" "$LIVE/"
# 2) assets (nomes com hash unico) sao acumulativos — abas ja abertas na versao
#    anterior continuam carregando seus arquivos sem erro 404 durante o deploy
mkdir -p "$LIVE/assets"
rsync -a "$STAGING/assets/" "$LIVE/assets/"
# Marca os assets desta versao como recem-publicados (protege da limpeza)
find "$STAGING/assets" -type f -printf '%P\n' | while read -r f; do touch "$LIVE/assets/$f"; done
# 3) limpeza: remove apenas assets sem modificacao ha mais de 24h
find "$LIVE/assets" -type f -mmin +1440 -delete || true
find "$LIVE/assets" -type d -empty -delete || true

echo "==> Smoke test local"
node scripts/validate-prod-bundle.mjs

systemctl reload nginx
echo "==> Deploy frontend OK"
