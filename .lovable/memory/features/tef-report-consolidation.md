---
name: TEF Report Consolidation
description: Relatório TEF deve buscar PinPad em orders + pdv_sales, sem SmartPOS/maquininha móvel.
type: feature
---
O Relatório TEF deve consolidar toda transação TEF PinPad aprovada/finalizada, independentemente da origem da cobrança.

Regra obrigatória: buscar dados TEF tanto em `orders.notes` quanto em `pdv_sales.notes`, deduplicando por NSU/autorização para não duplicar vendas vinculadas a pedido.

Não classificar maquininha móvel/SmartPOS como TEF. Para o usuário, TEF = PinPad Multiplus/WebService. Relatórios TEF não devem misturar pagamentos de máquina móvel.

Motivo: vendas fechadas direto no PDV V2 podem não ter `orders` correspondente, mas precisam aparecer no relatório TEF e no fechamento.