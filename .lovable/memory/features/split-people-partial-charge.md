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
