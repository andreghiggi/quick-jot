#!/usr/bin/env python3
"""Authenticated host scheduler. Reads the server's existing secret only at run time."""
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    env_path = Path(os.environ.get('SUPABASE_DIR', '/opt/apps/comandatech-api/supabase')) / '.env'
    key = None
    for line in env_path.read_text().splitlines():
        if line.startswith('SERVICE_ROLE_KEY='):
            key = line.split('=', 1)[1].strip().strip('\"\'')
            break
    if not key or not re.fullmatch(r'[A-Za-z0-9_.-]+', key):
        raise SystemExit('WhatsApp recovery: service credential unavailable')
    # Never put credentials in crontab, process arguments or logs.
    with tempfile.NamedTemporaryFile(mode='w', prefix='wa-cron-', delete=False) as config:
        path = config.name
        os.chmod(path, 0o600)
        config.write('url = "https://api.comandatech.com.br/functions/v1/whatsapp-auto-heal"\n')
        config.write('request = "POST"\nheader = "Content-Type: application/json"\n')
        config.write(f'header = "Authorization: Bearer {key}"\n')
        config.write('data = "{}"\nconnect-timeout = 5\nmax-time = 55\nfail\nsilent\nshow-error\noutput = "/dev/null"\n')
    try:
        subprocess.run(['curl', '--config', path], check=True)
    finally:
        Path(path).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
