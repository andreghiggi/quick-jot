---
name: Cash closing consolidation
description: Fechamento de caixa must include every finalized/charged payment regardless of origin
type: feature
---
Todo pagamento cobrado/finalizado precisa entrar no Relatório de Fechamento/Caixa, independentemente de origem: balcão, Pedido Express, online/cardápio, retirada, delivery, mesa/comanda ou Mesa QR.

Regra: o fechamento deve consolidar movimentações reais do caixa/período e não pode depender apenas de `orders`, apenas de `pdv_sales`, apenas de dinheiro, nem filtrar por origem específica. Se uma cobrança legítima não tiver `pdv_sale` vinculada, ela ainda deve ser considerada pela forma de pagamento registrada no pedido.

Não confundir maquininha móvel/POS com TEF PinPad. TEF é somente a integração PinPad/Multiplus registrada como TEF.