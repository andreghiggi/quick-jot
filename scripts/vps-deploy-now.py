#!/usr/bin/env python3
"""Deploy frontend dist + scripts para VPS via SFTP/SSH."""
import os
import sys
import tarfile
import tempfile
import paramiko

HOST = os.environ.get('VPS_HOST', '153.75.244.221')
USER = os.environ.get('VPS_USER', 'root')
PASSWORD = os.environ.get('VPS_PASSWORD')
if not PASSWORD:
    print('ERRO: defina VPS_PASSWORD no ambiente')
    sys.exit(1)
APP_DIR = '/var/www/comandatech'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILES = [
    'scripts/validate-bundle.mjs',
    'scripts/validate-prod-bundle.mjs',
    'deploy/vps-deploy-frontend.sh',
    '.env.production',
]


def main():
    dist = os.path.join(ROOT, 'dist')
    if not os.path.isdir(dist):
        print('ERRO: rode npm run build antes')
        sys.exit(1)

    with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
        tar_path = tmp.name
    with tarfile.open(tar_path, 'w:gz') as tar:
        tar.add(dist, arcname='dist')

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f'Conectando {USER}@{HOST}...')
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = client.open_sftp()

    remote_tar = '/tmp/comandatech-dist-deploy.tar.gz'
    print('Upload dist...')
    sftp.put(tar_path, remote_tar)
    os.unlink(tar_path)

    for rel in FILES:
        local = os.path.join(ROOT, rel.replace('/', os.sep))
        remote = f'{APP_DIR}/{rel.replace(chr(92), "/")}'
        remote_dir = os.path.dirname(remote).replace(chr(92), '/')
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            client.exec_command(f'mkdir -p {remote_dir}')
        print(f'Upload {rel}...')
        sftp.put(local, remote)

    sftp.close()

    cmd = f'''
set -e
cd {APP_DIR}
chmod +x deploy/vps-deploy-frontend.sh
echo "==> Validar dist recebido"
node scripts/validate-bundle.mjs dist/assets/$(ls dist/assets/index-*.js 2>/dev/null | xargs -n1 basename | tail -1) 2>/dev/null || true
rm -rf /tmp/comandatech-dist-new
mkdir -p /tmp/comandatech-dist-new
tar -xzf {remote_tar} -C /tmp/comandatech-dist-new
node scripts/validate-bundle.mjs /tmp/comandatech-dist-new/dist/assets/$(ls /tmp/comandatech-dist-new/dist/assets/index-*.js | xargs -n1 basename | tail -1)
echo "==> Publicar"
mkdir -p {APP_DIR}/dist
rsync -a --delete /tmp/comandatech-dist-new/dist/ {APP_DIR}/dist/
rm -f {remote_tar}
systemctl reload nginx
node scripts/validate-prod-bundle.mjs
echo "DEPLOY_OK"
'''
    print('Executando deploy na VPS...')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    print(out)
    if err:
        print(err, file=sys.stderr)
    client.close()
    if code != 0 or 'DEPLOY_OK' not in out:
        print(f'ERRO: deploy falhou (exit {code})')
        sys.exit(1)
    print('Deploy concluído com sucesso.')


if __name__ == '__main__':
    main()
