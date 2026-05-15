---
name: payment-modality-split-i9
description: Lancheria I9 — formas de pagamento separadas por Entrega/Retirada (Cardápio, Express, OrderCardChargeDialog/PDV V2).
type: feature
---
Apenas company_id `8c9e7a0e-dbb6-49b9-8344-c23155a71164`. Colunas `payment_methods.show_for_delivery` e `show_for_pickup` (default true). UI de cadastro só aparece nas abas `menu` e `express`. Consumo filtra: Menu por `deliveryType==='pickup'`, Express por `deliveryType` ('entrega'|'retirada', Cliente Loja = retirada), `OrderCardChargeDialog` deriva de `order.deliveryAddress` (vazio = pickup) e passa via prop `deliveryFilter` ao `PDVV2PaymentDialog`.
