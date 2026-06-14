---
name: Print V2 — rótulo de grupo + endereço invertido (I9)
description: Comanda/recibo V2 com ■ sublinhado no rótulo do grupo e endereço de entrega invertido, gated por I9.
type: feature
---

## Markers V2 (auto_printer.py v8.32+)
- `[ADDGROUP_LABEL]Nome[/ADDGROUP_LABEL]` → `■ Nome` em **sublinhado**, capitalização original (sem CAPS).
- `[ENDERECO]endereço[/ENDERECO]` → bloco invertido (fundo preto, texto branco), mesmo estilo de `[CLIENTE]`.
- `[ADD]item[/ADD]` (já existia) → `+ ITEM` em CAPS (I9), `>> item` (demais lojas).

## Regras de renderização (gated I9 = `8c9e7a0e-dbb6-49b9-8344-c23155a71164`)
- **1 grupo só** → não emite `[ADDGROUP_LABEL]`, lista direto `+ ITEM`.
- **2+ grupos** → emite `[ADDGROUP_LABEL]Nome[/ADDGROUP_LABEL]` antes de cada bloco de itens.
- Endereço só emitido quando `deliveryAddress` presente e companyId === I9.

## Arquivos
- `src/utils/printProductionTicket.ts` → V2 emite os markers no HTML.
- `src/utils/pdvV2Print.ts` → `buildReceiptHTML` (V2) emite os markers + propaga `deliveryAddress` e `groupedOptionals`.
- `scripts/auto_printer.py` → handlers `m_addgroup` e `m_endereco` no laço principal.

## Próximo passo
Propagar `groupedOptionals` e `deliveryAddress` nos 5 callers de `printOnlyReceipt`/`printOnlineOrBalcao` (PDVV2, PedidoExpress, PDVV2PaymentDialog, PDVV2ClosedTabsDialog, OrderEditDialog). Hoje só funciona quando o caller passa esses campos — fallback continua plano sem regressão.