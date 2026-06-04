---
name: Split por pessoas - cobrança parcial
description: Campo "Cobrar agora quantas partes?" no split por pessoas — operador cobra várias pessoas numa única transação no PDV V2. Implementado v1.13.0-beta.
type: feature
---
## Status: IMPLEMENTADO (v1.13.0-beta — Opção B, sem refactor pesado)
Fluxo: `PDVV2PaymentDialog` (modo `i9Mode='split'` ou `activeSplit`) → `confirmImportTabI9` em `src/pages/PDVV2.tsx`. Aplicado de forma cirúrgica sem extrair wrapper isolado (risco baixo: alterações limitadas a call-sites + UI, sem tocar serviços TEF/NFC-e).

## Como funciona
- Campo `splitPartsToCharge` (state em `PDVV2PaymentDialog`) — default 1, max = `splitPeople` (1ª pessoa) ou `totalPeople - currentPerson + 1` (pessoas seguintes).
- `splitInfo` enviado para `confirmImportTabI9` agora carrega `{ perPerson (base), totalPeople, partsToCharge }`.
- `confirmImportTabI9` calcula `chargeAmount = perPerson × parts`, usa em `runTefPayment` + `addSale` + linha de crédito no `tab_items`, e decrementa `splitData.remaining` em `parts` (não 1).
- Rótulos: "Pessoa X/N" (parts=1) ou "Pessoas X-Y/N" (parts>1) — aplicados em sale_notes, product_name de venda, item de crédito e observação NFC-e parcial.
- Centavo residual: `perPerson = round(grossTotal/N, 2)` mantém comportamento atual (3 cobranças × 33,34 = 100,02 para R$100/3); somar partes não introduz nova distorção.
- Botão "Confirmar Pagamento" agora habilita no modo split (era bloqueado e exigia "Distribuir entre os itens").

## NÃO mexer
TEF v1.0/v1.1/v1.2 beta, pinpadService, tef-webservice, nfce-proxy, PDVV2PaymentDialog (sem refactor prévio), PDVV2MultiPaymentDialog (v1.6), OrderCardChargeDialog, Finalizar Venda direto, Rachar Item (Lancheria I9), Pedido Express.

## Fase 2 (também pendente)
Estender "cobrar X de N pessoas" para Pedido Express, OrderCardChargeDialog, Finalizar Venda direto e avaliar checkout do cardápio público.

## Continuidade no OrderCardChargeDialog (v1.13.1-beta)
Estado do split por pessoas agora persiste em `orders.paid_items.split_state = { totalPeople, perPerson, paidPeople }`.
- `OrderCardChargeDialog` lê esse campo e passa `activeSplit` ao `PDVV2PaymentDialog`, reaproveitando o painel read-only "Pessoa X/N — restam Y" e o campo "cobrar quantas partes" já limitado ao restante.
- A cada cobrança via split, `paidPeople += partsToCharge`. Quando atinge `totalPeople` ou o pedido é quitado, o `split_state` é removido.
- Não toca PDV V2 comanda (`PDVV2.tsx` continua usando `i9SplitInfo` em memória), Pedido Express, TEF, NFC-e, multi-pagamento ou rachar item.

## NFC-e detalhada com itens rateados (v1.13.3-beta)
Tanto `OrderCardChargeDialog` (bloco `isSplitByPeople`) quanto `PedidoExpressDialog.handleSubmitSplitPartial` deixaram de emitir linha sintética "Parcela X - rachado"/"Divisão X/Y" e passaram a:
- Construir `ratio = partsToCharge / totalPeople` (última parcela usa `remaining/totalPeople` para fechar 100%).
- Listar **todos** os itens do pedido/cart com `quantity = round3(originalQty * ratio)` e `unit_price` original — quantidade fracionada baixa estoque corretamente ao final das N parcelas (sem multiplicar baixa pelo nº de pessoas).
- Ajustar centavos no `unit_price` do **último item** para o somatório bater exatamente com `finalTotal/partialTotal`.
- Usar o **mesmo array** detalhado tanto em `addSale` (caixa interno / relatórios / ABC) quanto em `nfceItems` (DANFE).
- Em `OrderCardChargeDialog` os itens rateados entram com `source_index = -1` para NÃO atualizar `paid_qtys` — controle de saldo permanece via `paid_amount` + `split_state`.
- Não altera divisão por itens, PDV V2 comanda/mesa, TEF v1.0/v1.1/v1.2-beta, runTefPayment, pinpadService, nfce-proxy, multi-pagamento ou finalização.
