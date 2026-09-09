# Auditoria Lovable → VPS (checklist)

Produção oficial: **VPS** (`app.comandatech.com.br` + `api.comandatech.com.br`).

Lovable permanece **somente** para prompts (`.lovable/`) e IA de importação (`extract-menu`, `extract-optionals` via `ai.gateway.lovable.dev`).

## Verificação automática (repo/VPS)

```bash
# Bundle prod deve conter api.comandatech.com.br (não iwmrtxdzlkasuzutxvhh)
curl -s https://app.comandatech.com.br/ | grep -o 'api\.comandatech\.com\.br'

# Auditoria lojas
SUPABASE_URL=https://api.comandatech.com.br SUPABASE_SERVICE_ROLE_KEY=... node scripts/vps-audit-companies.mjs
```

## Painel Lovable (manual)

- [x] Desativar **Publish** / auto-deploy do projeto (concluído 2026-09-09)
- [ ] App preview `*.lovableproject.com` não usado por lojas
- [ ] Manter projeto apenas para edição/prompts

## Supabase Cloud `iwmrtxdzlkasuzutxvhh` (manual)

- [ ] Edge Functions duplicadas: desabilitar se VPS já serve
- [ ] **Database → Extensions → pg_cron**: listar jobs; desativar backup-mirror para cloud
- [ ] **Database Webhooks**: nenhum apontando para cloud em produção
- [ ] Auth: nenhuma loja usando anon key cloud (validar bundle prod)

## VPS (manual pós-deploy)

- [ ] Realtime health interno = 200
- [ ] `docker ps` — todos healthy
- [ ] pg_cron job `nfce-contingencia-sync` ativo (migration `20260909120000_*`)
- [ ] Lojas com `auto_printer.py` atualizado (`SUPABASE_URL=https://api.comandatech.com.br`)

## Exceções permitidas

| Serviço | Motivo |
|---------|--------|
| `extract-menu` / `extract-optionals` | IA via Lovable gateway (acordado) |
| `dfe-fiscalflow-proxy` → `vdzkhealunurfgrujekg` | Infra FiscalFlow (terceiro) |
| `.lovable/`, `lovable-tagger` (dev) | Prompts / dev only |
