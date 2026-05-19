---
name: Product Cost Tracking
description: Campo cost_price em products + tabela product_cost_history com trigger automático para CMV/margem
type: feature
---
- `products.cost_price` (numeric, nullable) armazena o custo unitário.
- Tabela `product_cost_history` (product_id, company_id, old_cost, new_cost, changed_by, created_at) com RLS por company.
- Trigger `trg_log_product_cost_change` (AFTER UPDATE OF cost_price) grava histórico automaticamente via `log_product_cost_change()`.
- UI: campo "Custo (R$)" no diálogo Novo Produto e Editar Produto em `Products.tsx`, com indicador de Margem% e Markup% calculados em tempo real.
- Hook `useProducts` mapeia `cost_price` <-> `costPrice` no insert/update/select.
- Próximos passos previstos: usar custo na Curva ABC (ordenação por lucro, coluna Lucro Bruto), no Relatório de Vendas (CMV/margem) e Dashboard.
