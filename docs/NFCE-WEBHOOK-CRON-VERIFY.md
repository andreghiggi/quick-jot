# Verificação webhook NFC-e + cron contingência (VPS)

**Data:** 2026-09-09

## Webhook Fiscal Flow → VPS

| Item | Valor esperado |
|------|----------------|
| URL | `https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/nfce-webhook` |
| Método | POST com assinatura HMAC (`x-webhook-signature`) |
| Health sem auth | HTTP **401** (endpoint ativo, rejeita sem assinatura) |

**Ação manual no painel Fiscal Flow:** confirmar que o webhook de cada CNPJ aponta para a URL Lovable acima (não para `api.comandatech.com.br`).

## Cron contingência-sync

| Mecanismo | Status |
|-----------|--------|
| pg_cron (migration) | Falhou na VPS (`permission denied`) |
| **Host crontab fallback** | **Ativo** — `*/10 * * * * curl … nfce-contingencia-sync` |

Verificar: `crontab -l | grep nfce-contingencia`

## Reconciliação órfãs

```bash
SUPABASE_URL=https://api.comandatech.com.br \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/reconcile-nfce-orphans.mjs
```
