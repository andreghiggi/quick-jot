---
name: payment-modality-split-i9
description: Formas de pagamento separadas por Entrega/Retirada — LIBERADO PARA TODAS AS LOJAS nas abas Cardápio Online e Pedido Express (PDV não tem).
type: feature
---
Liberado para todas as lojas (antes era allow-list I9/Bon Appetit). Colunas `payment_methods.show_for_delivery` e `show_for_pickup` (default true). UI de cadastro aparece nas abas `menu` e `express` em PaymentMethods.tsx. Consumo: Menu por `deliveryType==='pickup'`, PedidoExpressDialog por `deliveryType` ('entrega'|'retirada', Cliente Loja = retirada), `OrderCardChargeDialog` deriva de `order.deliveryAddress` (vazio = pickup) e passa via prop `deliveryFilter` ao `PDVV2PaymentDialog`. Flags `isI9PaymentSplit`/`isPaymentSplitCompany` agora sempre `true`.
