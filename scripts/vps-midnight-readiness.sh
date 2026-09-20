#!/usr/bin/env bash
# Diagnóstico e cópia de retorno do frontend. Não publica, não altera banco,
# não chama funções fiscais e não manipula filas, TEF ou configurações.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/comandatech}"
LIVE_DIR="${APP_DIR}/dist"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/comandatech-readiness}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

echo "readiness_started_at_utc=${STAMP}"
echo "mode=diagnostic_and_frontend_backup_only"

for command_name in curl tar sha256sum; do
  command -v "$command_name" >/dev/null || {
    echo "FAIL: comando obrigatório ausente: ${command_name}" >&2
    exit 1
  }
done

test -d "$LIVE_DIR" || {
  echo "FAIL: frontend ativo não encontrado" >&2
  exit 1
}

auth_status="$(curl -sS -o /dev/null -w '%{http_code}' https://api.comandatech.com.br/auth/v1/health || true)"
app_status="$(curl -sS -o /dev/null -w '%{http_code}' https://app.comandatech.com.br/ || true)"
echo "app_http=${app_status}"
echo "auth_http=${auth_status}"

if [[ "$app_status" != "200" || "$auth_status" != "200" ]]; then
  echo "FAIL: produção não está saudável; nenhuma preparação adicional será feita" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
tar -C "$LIVE_DIR" -czf "${BACKUP_DIR}/frontend-live.tar.gz" .
sha256sum "${BACKUP_DIR}/frontend-live.tar.gz" > "${BACKUP_DIR}/frontend-live.tar.gz.sha256"

{
  echo "created_at_utc=${STAMP}"
  echo "source=${LIVE_DIR}"
  echo "app_http=${app_status}"
  echo "auth_http=${auth_status}"
  echo "hostname=$(hostname)"
} > "${BACKUP_DIR}/readiness.txt"

if command -v docker >/dev/null 2>&1; then
  docker ps --format '{{.Names}}\t{{.Status}}' > "${BACKUP_DIR}/containers.txt"
fi

if [[ -d /var/backups ]]; then
  find /var/backups -maxdepth 2 -type f -printf '%TY-%Tm-%TdT%TH:%TM:%TSZ %s %p\n' \
    2>/dev/null | sort -r | head -n 100 > "${BACKUP_DIR}/existing-backups.txt" || true
fi

echo "frontend_backup=${BACKUP_DIR}/frontend-live.tar.gz"
echo "database_backup=not_created_or_modified"
echo "readiness_result=PASS"