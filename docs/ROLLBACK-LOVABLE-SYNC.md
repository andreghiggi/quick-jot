# Rollback Lovable — sync de dados e pendências

## Backups (VPS `/var/backups/comandatech-pg/`)

| Arquivo | Conteúdo |
|---------|----------|
| `pre-rollback-vps-20260910-003224.dump` | Postgres VPS completo (14 MB) |
| `pre-rollback-cloud-*.json` | Contagens Lovable antes do sync |
| `comandatech-mirror-20260909-*.dump` | Mirrors diários pré-cutover |

## Sync executado (2026-09-10)

- **Pedidos (`orders`):** todos os IDs presentes na VPS foram upsertados na Lovable (delta 0).
- **Demais tabelas** (payment_methods, store_settings, products, nfce_records, etc.): requerem **service role** Lovable ou **senha postgres** no `.env.backup` para sync completo.

### Completar sync config + NFC-e

1. Supabase Dashboard → `iwmrtxdzlkasuzutxvhh` → Settings → API → copie **service_role**
2. Execute:

```powershell
cd C:\xampp\htdocs\comandatech
$env:VPS_SERVICE_KEY="..."      # service role VPS (backup)
$env:LOVABLE_SERVICE_KEY="..."  # service role Lovable
$env:LOVABLE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
node scripts/rollback-run-sync.mjs
```

Ou preencha `LOVABLE_DB_URL` em `.env.backup` e rode na VPS:

```bash
SOURCE_DB_URL=postgresql://postgres:...@172.18.0.2:5432/postgres
TARGET_DB_URL=postgresql://postgres.iwmrtxdzlkasuzutxvhh:...@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
node scripts/rollback-sync-vps-to-cloud.mjs
npm run mirror-auth   # auth.users + identities
```

## Fiscal Flow (manual)

Alterar webhook de cada CNPJ para:

`https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/nfce-webhook`

## GitHub Secrets

Atualizar conforme [GITHUB-ACTIONS-SECRETS-VPS.md](./GITHUB-ACTIONS-SECRETS-VPS.md) (URL + anon key Lovable).

## Lovable Publish

Reativar Publish no painel Lovable (frontend principal continua via VPS nginx + GitHub Actions).
