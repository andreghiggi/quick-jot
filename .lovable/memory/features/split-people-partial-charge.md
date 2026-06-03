---
name: Split por pessoas - cobrança parcial
description: UX para cobrar várias frações de pessoas numa única transação no split por pessoas
type: feature
---
## Status: ADIADO (Opção B)
Fase 1 NÃO foi implementada. Motivo: o fluxo real de "Importar e cobrar mesa → Dividir por pessoas" no PDV V2 vive em `PDVV2PaymentDialog` (`activeSplit { perPerson, totalPeople, currentPerson }`) + `confirmImportTabI9` em `src/pages/PDVV2.tsx`, não no `PDVV2TabImportDialog` (orphan). Mexer ali tocaria o fluxo TEF v1.1 consolidado (Lancheria I9) — risco de regressão em integração homologada.

## Pré-requisito antes de retomar
Extrair o split-loop de `confirmImportTabI9` + `activeSplit` para um wrapper isolado, sem alterar `runTefPayment`/`pinpadService`/`nfce-proxy`. Só depois adicionar o campo "Cobrar X de N pessoas".

## Escopo desejado (quando retomado)
- Campo "Cobrar agora para quantas pessoas?" no modo split por pessoas (default 1, max = pessoas restantes)
- `amount = perPerson × N`, última fração absorve centavo residual
- Cada fração agrupada vira 1 NFC-e (modelo atual, valor maior)

## NÃO mexer
TEF v1.0/v1.1/v1.2 beta, pinpadService, tef-webservice, nfce-proxy, PDVV2PaymentDialog (sem refactor prévio), PDVV2MultiPaymentDialog (v1.6), OrderCardChargeDialog, Finalizar Venda direto, Rachar Item (Lancheria I9), Pedido Express.

## Fase 2 (também pendente)
Estender "cobrar X de N pessoas" para Pedido Express, OrderCardChargeDialog, Finalizar Venda direto e avaliar checkout do cardápio público.
