---
name: Split por pessoas - cobrança parcial
description: UX para cobrar várias frações de pessoas numa única transação no split por pessoas
type: feature
---
## Fase 1 (a implementar quando liberado)
Escopo isolado ao `PDVV2TabImportDialog` modo `split_people`:
- Novo input "Cobrar agora para quantas pessoas?" (default 1, max = pessoas restantes derivadas de `tab.paid_amount / perPerson`)
- Botão vira "Cobrar {perPerson × N} ({N} de {total} pessoas)"
- `onPaySplit(amount, remainingPeople, totalPeople)` recebe `amount = perPerson × N`
- Última fração absorve centavo residual quando `unpaidTotal / numPeople` não fecha exato
- Cada fração agrupada vira 1 NFC-e (igual ao modelo atual, só com valor maior)

## NÃO mexer
TEF v1.0/v1.1/v1.2 beta, pinpadService, tef-webservice, nfce-proxy, PDVV2PaymentDialog, PDVV2MultiPaymentDialog (v1.6), OrderCardChargeDialog, Finalizar Venda direto, Rachar Item (Lancheria I9), Pedido Express.

## Fase 2 (pendente, não implementar sem ordem)
Estender "cobrar X de N pessoas" para:
- Pedido Express
- OrderCardChargeDialog
- Finalizar Venda direto (PDV V2 sem comanda)
- Avaliar checkout do cardápio público
