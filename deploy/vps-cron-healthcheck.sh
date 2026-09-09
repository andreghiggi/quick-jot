#!/usr/bin/env bash
# Instala cron que valida bundle de produção a cada hora (alerta no syslog se falhar).
APP_DIR="${APP_DIR:-/var/www/comandatech}"
CRON_LINE="0 * * * * cd $APP_DIR && /usr/bin/node scripts/validate-prod-bundle.mjs >> /var/log/comandatech-bundle-check.log 2>&1 || logger -t comandatech 'FALHA validate-prod-bundle — bundle pode estar quebrado'"
(crontab -l 2>/dev/null | grep -v 'validate-prod-bundle' || true; echo "$CRON_LINE") | crontab -
echo "Cron instalado: validate-prod-bundle a cada hora"
