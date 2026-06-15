---
name: Sale Cancellation Audit (PDV V2)
description: Cancelamento de venda exige motivo (>=20 chars) e grava log em pdv_sale_cancellations; nova página Histórico de Comandas em /pdv-v2/comandas-historico expõe comandas após o fechamento do caixa.
type: feature
---

# Auditoria de cancelamento de venda + Histórico de Comandas

## Regras
- Cancelamento de venda no PDV V2 NUNCA mais usa `confirm()`. Sempre passa pelo `PDVV2CancelSaleDialog` com textarea obrigatório (mínimo **20 caracteres**, validado via `CANCEL_REASON_MIN_LENGTH` em `src/utils/saleCancellation.ts`).
- Toda operação grava uma linha em `public.pdv_sale_cancellations` com: `sale_id`, `company_id`, `register_id`, `cancelled_by`, `cancelled_by_name`, `cancelled_at`, `reason`, `tef_reversed`.
- A venda em `pdv_sales.notes` recebe `[CANCELADA] Motivo: ... | <notes originais>` via `buildCancelledNotes` — preserva compatibilidade com filtros existentes que olham para `[CANCELADA]`.
- Se houver TEF PinPad ativo, o estorno (`estornarTefPedido`) roda ANTES de gravar o log e do update; falha de estorno aborta o cancelamento.

## Histórico de Comandas
- Rota: `/pdv-v2/comandas-historico` (sidebar PDV V2 → "Operação" → logo abaixo de "Pedidos").
- Lista `pdv_sales` filtradas por `company_id` + intervalo de datas em America/Sao_Paulo, com `notes ilike '%Comanda%'`.
- Reaproveita o card `PDVV2ClosedTabSaleCard` com `allowCancelSale={false}` — **cancelar venda só é permitido dentro do caixa atual aberto** (decisão do usuário).
- Mostra Motivo / Por / Em / "TEF estornado" para vendas canceladas, carregado via `loadCancellationsBySaleIds`.

## Não regredir
- Não voltar a usar `confirm()` para cancelamento.
- Não habilitar `allowCancelSale` na página de histórico.
- Vendas canceladas anteriores à v1.22.8-beta aparecem como "Motivo não informado" — não inventar dados.
- Tabela tem RLS por `user_belongs_to_company`; não criar políticas mais abertas.