---
name: backup-mirror
description: Backup automático diário (cron 03:00 BRT) espelhando o banco public da origem para o Supabase externo vyotbtmnnosiejyltlxc. Auth via Vault (BACKUP_TRIGGER_SECRET) e target DB URL via Vault (BACKUP_TARGET_DB_URL_VAULT). Resync completo via scripts/backup_resync.sh quando schema dessincronizar.
type: feature
---
- Edge function: `backup-mirror` (UPSERT por PK em todas as tabelas com PK).
- Cron: `backup-mirror-daily` (`0 6 * * *` UTC = 03:00 BRT).
- Secrets do auth e da URL de destino moram no Vault (`vault.create_secret`); edge function tenta env primeiro e cai pro Vault.
- Logs: `public.backup_runs`.
- Erros tipo "column X of relation Y does not exist" no run = schema do destino atrasado → rodar `bash scripts/backup_resync.sh` no sandbox pra recriar `public` inteiro e recarregar dados.
- FKs para `auth.users` falham no resync (esperado: sandbox não tem acesso ao schema `auth`); 3 constraints ficam pendentes.
