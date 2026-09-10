# Auditoria Lovable — pós-rollback (2026-09-10)

Produção: **Lovable Cloud** (`iwmrtxdzlkasuzutxvhh.supabase.co`) + frontend VPS (`app.comandatech.com.br`).

## Concluído

- [x] Frontend bundle aponta para Lovable (`validate-prod-bundle.mjs` PASS)
- [x] Backup VPS `pre-rollback-vps-20260910-003224.dump` (14 MB)
- [x] Backup Lovable contagens JSON + dump cloud 7.6 MB
- [x] Sync pedidos VPS → Lovable (delta 0 por loja)
- [x] Crons VPS `nfce-contingencia-sync` e `validate-prod-bundle` removidos
- [x] Session-killer removido do `index.html`

## Pendente (manual)

- [ ] **GitHub Secrets** → URL + anon key Lovable ([GITHUB-ACTIONS-SECRETS-VPS.md](./GITHUB-ACTIONS-SECRETS-VPS.md))
- [ ] **Sync config** payment_methods, store_settings, nfce_records ([ROLLBACK-LOVABLE-SYNC.md](./ROLLBACK-LOVABLE-SYNC.md))
- [ ] **Fiscal Flow** webhooks → `https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/nfce-webhook`
- [ ] **Lovable Publish** reativar no painel
- [ ] **Edge functions** deploy via GitHub Actions (`deploy-supabase-functions.yml`) — requer `SUPABASE_ACCESS_TOKEN`
- [ ] **auto_printer** redistribuir nas lojas (URL já é Lovable em `scripts/auto_printer.py`)
- [ ] Parar Docker Supabase VPS após sync config confirmado (manter backups 30 dias)

## Verificação

```bash
node scripts/validate-prod-bundle.mjs
node scripts/rollback-compare-api.mjs   # com VPS_SERVICE_KEY + LOVABLE_ANON_KEY
```
