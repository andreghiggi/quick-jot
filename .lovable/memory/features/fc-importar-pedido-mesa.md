---
name: FC Importar Pedido/Mesa
description: Frente de Caixa importa pedido (cardápio) ou mesa (QR) do dia para cobrar tudo num cupom único; itens importados são imutáveis.
type: feature
---
Frente de Caixa ganha dois botões condicionais no rail lateral:
- "Importar pedido" → só se módulo `cardapio` ativo.
- "Importar mesa" → só se módulo `cardapio_mesa` ativo.

Fluxo:
- Lista pedidos do dia (timezone America/Sao_Paulo) com `pdv_sale_id IS NULL` e `status != delivered`, filtrando por `origin='cardapio'` ou `origin='mesa_qr'`.
- Importação adiciona os itens ao carrinho com flag `imported=true`. Itens importados são IMUTÁVEIS: não podem ser editados, ter quantidade alterada ou ser removidos. Aparecem com badge "IMPORTADO" e fundo âmbar.
- Apenas 1 pedido pode ser importado por venda; podem ser adicionados produtos novos (mercado) em cima.
- Após fechamento da venda: `orders.status='delivered'` + `orders.pdv_sale_id=<sale>` e `pdv_sales.imported_order_id=<order>`. O pedido continua existindo em `orders` (só muda status), preservando histórico/relatórios da mesa/cardápio.

Schema:
- `orders.pdv_sale_id uuid` (FK → pdv_sales, ON DELETE SET NULL).
- `pdv_sales.imported_order_id uuid` (FK → orders, ON DELETE SET NULL).

Observação sobre status: o enum `order_status` não tem `paid`, então usamos `delivered` para ambos (pedido e mesa). O vínculo via `pdv_sale_id` é o que distingue venda importada.