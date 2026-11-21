#!/usr/bin/env bash
# Called automatically by the approved functions deploy; no database extension needed.
set -euo pipefail
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
install -m 700 "$SCRIPT_DIR/whatsapp-auto-heal-cron.py" /usr/local/sbin/whatsapp-auto-heal-cron.py
CRON_WA='* * * * * flock -n /run/lock/whatsapp-auto-heal.lock python3 /usr/local/sbin/whatsapp-auto-heal-cron.py'
( crontab -l 2>/dev/null | grep -v 'whatsapp-auto-heal' || true; echo "$CRON_WA" ) | crontab -
echo 'WhatsApp: cron autenticado instalado; uma verificação por minuto, sem mensagens de teste.'
