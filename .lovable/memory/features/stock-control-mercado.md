---
name: Controle de Estoque (Mercado)
description: Fase 3 do módulo Mercado — track_stock por produto, stock_movements, apply_stock_movement, baixa automática no Frente de Caixa, tela /estoque
type: feature
---
Controle de estoque opcional por produto, gated pelo módulo `mercado`.

Banco: `products.track_stock/stock_quantity/min_stock`. Tabela `stock_movements` (type: sale|manual_in|manual_out|adjustment|initial). Função `apply_stock_movement` SECURITY DEFINER (no-op se produto sem track_stock).

Frontend: hook `useStockMovements` + helper `applyStockMovementOnce`. Seção no edit dialog de Produtos. Página `/estoque` (EstoqueRelatorio) com Entrada/Saída/Ajuste/Histórico e CSV. FrenteCaixa faz baixa fire-and-forget após addSale.

Escopo: só Frente de Caixa dá baixa. Pedido Express e cardápio online NÃO. Sem bloqueio rígido. Versão 1.10.0-beta.