---
name: Product Type Field
description: Campo product_type (cardapio/mercado/ambos) na tabela products, com UX adaptativa no cadastro
type: feature
---
Campo `product_type` em `public.products` (CHECK em cardapio/mercado/ambos, default 'cardapio'), índice (company_id, product_type).

UX adaptativa em `ProductEdit.tsx`:
- Seletor de tipo no topo (só aparece se módulo `mercado` ativo).
- `mercado`: categoria opcional → cai em "Geral" automaticamente no save (cria se não existir).
- Visibilidade derivada: `mercado` → menu_item/waiter_item=false; `cardapio`/`ambos` → ambos true. Toggles antigos ficam em Collapsible "Visibilidade avançada".
- Bloco "Dados Fiscais" agora em Collapsible (auto-abre se já tem NCM/CFOP/CEST/taxRuleId).
- Botão inline "+ Criar nova categoria" no Field de categoria.

`Products.tsx`:
- Botão "Novo Produto" abre mini-Dialog com 3 opções → navega para `/produtos/novo?tipo=...`.
- Chips de filtro Todos/Cardápio/Mercado/Ambos quando mercado on.
- Badge colorido por tipo em cada card (azul/verde/roxo).

Migração 2026-06-21 popular product_type baseando-se em pdv_item/menu_item das lojas existentes — zero impacto.