---
name: backup-mirror
description: Backup automático diário (cron 03:00 BRT) espelhando auth.users, auth.identities e banco public da origem para o Supabase externo vyotbtmnnosiejyltlxc. Auth via Vault (BACKUP_TRIGGER_SECRET) e target DB URL via Vault (BACKUP_TARGET_DB_URL_VAULT). Invocação ENCADEADA: cada chamada processa ~8 tabelas e dispara a próxima via fetch+EdgeRuntime.waitUntil. Sync auth local: npm run mirror-auth (branch Cursor, sem deploy prod). Resync completo via scripts/backup_resync.sh quando schema dessincronizar.
type: feature
---
- Edge function: `backup-mirror` (auth.users + auth.identities + UPSERT public por PK).
- Sync auth local (sem deploy prod): `npm run mirror-auth` + `.env.backup` — ver `docs/BACKUP-AUTH-MIRROR.md`.
- Cron: `backup-mirror-daily` (`0 6 * * *` UTC = 03:00 BRT).
- Secrets do auth e da URL de destino moram no Vault (`vault.create_secret`); edge function tenta env primeiro e cai pro Vault.
- Logs: `public.backup_runs`.
- Erros tipo "column X of relation Y does not exist" no run = schema do destino atrasado → rodar `bash scripts/backup_resync.sh` no sandbox pra recriar `public` inteiro e recarregar dados.
- Auth espelhado antes do public na 1ª invocação; preserva `encrypted_password` para login no externo.
- Modos edge: `auth-only`, `skip_auth: true`, `health`.
- Limites por invocação: MAX_TABLES_PER_INVOCATION=8, MAX_RUNTIME_MS=30s, BATCH_SIZE=1000. syncSchema só roda na 1ª invocação.
- SKIP_TABLES (não espelhadas): backup_runs, tef_webservice_logs, pinpdv_logs, whatsapp_auto_reply_locks.
- RECENT_ONLY_TABLES: whatsapp_messages (últimos 90 dias).
- Status final 'success' só quando a última invocação termina; antes disso o run fica 'running' com tables_processed acumulado.
- Erro recorrente esperado: "companies: O serial da loja não pode ser alterado" (trigger set_company_serial bloqueia UPDATE). Não é bloqueante — status volta a 'success' nas próximas.
