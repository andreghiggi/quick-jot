#!/usr/bin/env python3
import os
import sys
import paramiko

HOST = os.environ.get('VPS_HOST', '153.75.244.221')
USER = os.environ.get('VPS_USER', 'root')
PASSWORD = os.environ.get('VPS_PASSWORD')
if not PASSWORD:
    print('ERRO: defina VPS_PASSWORD')
    sys.exit(1)

cmds = [
    'crontab -l | grep validate-prod || echo NO_CRON',
    'ls -la /var/www/comandatech/dist/assets/index-*.js | tail -1',
    'test -f /var/www/comandatech/.env.production && echo ENV_PROD_OK || echo ENV_PROD_MISSING',
    'test -x /var/www/comandatech/deploy/vps-deploy-frontend.sh && echo DEPLOY_SCRIPT_OK || echo DEPLOY_SCRIPT_MISSING',
    'cd /var/www/comandatech && node scripts/validate-prod-bundle.mjs',
    'curl -s -o /dev/null -w "api_health:%{http_code}" https://api.comandatech.com.br/auth/v1/health',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for cmd in cmds:
    print('---', cmd)
    _, o, e = c.exec_command(cmd, timeout=90)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(out)
    if err:
        print('ERR:', err)
c.close()
print('VPS_VERIFY_DONE')
