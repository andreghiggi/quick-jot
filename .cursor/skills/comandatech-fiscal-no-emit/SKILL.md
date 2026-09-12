---
name: comandatech-fiscal-no-emit
description: >-
  Proíbe emitir, cancelar ou reemitir NFC-e/NFe em produção sem pedido explícito do usuário.
  Use SEMPRE em tarefas fiscais, NFC-e, NFe, Fiscal Flow, SEFAZ, cancelamento ou scripts de emissão.
---

# ComandaTech — Fiscal: não emitir sem pedido

## Regra do usuário (texto literal)

> Nunca mais gere mais NFC-e e nenhuma nota sem eu pedir. Não emita mais NFC-e de nenhuma empresa.

## Proibido sem pedido explícito do usuário

- Emitir, reemitir ou cancelar NFC-e ou NFe (qualquer empresa/loja)
- Inutilizar numeração fiscal
- Rodar scripts que POST em `emit.agilizeerp.com.br` ou equivalente Fiscal Flow
- Chamar `nfce-proxy` com `action: 'emitir'`, `'cancelar'` ou `'inutilizar'`
- Qualquer operação que consuma numeração SEFAZ ou altere status fiscal em produção
- Rodar [`scripts/bon-appetit-reemit-5583.mjs`](../../scripts/bon-appetit-reemit-5583.mjs) — **DO NOT RUN** (requer `ALLOW_FISCAL_EMIT=1` e confirmação explícita)

## Permitido por padrão

- Consultas read-only (status, chave, XML, listagem Fiscal Flow GET)
- Diagnóstico de código, logs e registros `nfce_records` (SELECT)
- Alteração de **código** para corrigir fluxo futuro (frontend, `nfce-proxy`)
- Deploy de edge function ou frontend **sem** emitir nota de teste

## Se o usuário pedir emissão/cancelamento

Confirmar **antes** de executar:

1. Qual loja (`company_id` / CNPJ emitente)
2. Qual nota ou venda (número, `sale_id`, valor)
3. Quantas notas serão afetadas (ideal: **1**)
4. Ambiente: produção vs homologação

Nunca usar produção para “testar” fix de CPF/CNPJ.

## Bon Appetit — estado conhecido (2026-09-12)

| Nota | Valor | Status | Uso |
|------|-------|--------|-----|
| 5583 | R$ 188 | Autorizada | Venda original |
| 5607 | R$ 188 | Autorizada | Cupom com CNPJ `43450050000183` |
| 5587 | R$ 188 | Cancelada | 2ª nota duplicada (reemit teste) |

Ver [`docs/BON-APPETIT-NFCE-188-RESULT.md`](../../docs/BON-APPETIT-NFCE-188-RESULT.md).

## CPF/CNPJ nas próximas vendas

Fiscal Flow monta `<dest>` no XML só com campo **`cliente`**, não `destinatario`.

Correção em duas camadas (deploy, sem emitir nota de teste):

- [`src/services/nfceService.ts`](../../src/services/nfceService.ts) — envia `cliente` no payload
- [`supabase/functions/nfce-proxy/index.ts`](../../supabase/functions/nfce-proxy/index.ts) — mapeia `destinatario` → `cliente`

## Skills relacionadas

- `comandatech-prod-safe` — produção intocável
- `comandatech-deploy` — publicar frontend/functions
