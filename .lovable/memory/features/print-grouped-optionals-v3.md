---
name: Print V3 — adicionais agrupados
description: V3 (I9) imprime adicionais com rótulo do grupo em negrito (comanda + recibo); rollout isolado por company_id.
type: feature
---

## O que mudou
- `PrintItem` ganhou campo opcional `groupedOptionals?: { groupName; items }[]`.
- `generateProductionTicketHTMLv3` usa `groupedOptionals` quando presente — renderiza `Grupo: itens` com rótulo em negrito (classe `.grp-label-v3`).
- `pdvV2Print.ts → buildReceiptHTMLv3` preserva o nome do grupo extraído de `it.name` (linha `__BOLD__GRUPO: itens`).

## Origens que enviam grupos (gated por `company_id === I9`)
- `src/pages/Menu.tsx` (cardápio público delivery/retirada)
- `src/pages/MesaQR.tsx`
- `src/components/PedidoExpressDialog.tsx`

I9 ID: `8c9e7a0e-dbb6-49b9-8344-c23155a71164`.

## Não regrediu
- Layout V1/V2 inalterados — quando `groupedOptionals` ausente, V3 cai no `parseNotes` antigo.
- PDV V2 (`pdvV2Print.printOnlineOrBalcao`/`printOnlyReceipt`) herda automaticamente porque já passava `it.name` com parênteses ao recibo.
- NFC-e, TEF, PinPad, runMultiPayment, OrderCardChargeDialog, nfce-proxy intocados.

## Próximo passo
Após validação na I9, basta remover o gate `companyId === I9` nas 3 origens para expandir para Margen, Império, Bon Appetit, Rei do Açaí, Scubidão (todas em V2). V2 precisa também ganhar o mesmo bloco `.grp-label-v2` no renderer — não feito ainda neste rollout.