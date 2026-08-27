---
name: Atalho de tecla na Venda Rápida (Amore Mio)
description: Produto vinculado à tecla Ctrl via products.fast_hotkey; seleciona o item e abre campo de valor na Venda Rápida — exclusivo Amore Mio
type: feature
---
Amore Mio (id f5f9eec3-67bc-497a-88a6-ce41d3b15df8): coluna `products.fast_hotkey` (ex.: 'Control') vincula uma tecla ao produto. Editável em ProductEdit.tsx (seção "Venda Rápida", visível só para Amore Mio). Em PDVV2FastCheckout.tsx, listener de keydown chama handleAddProduct — se o produto não tem preço, abre o diálogo "Informar preço". Não dispara com diálogos abertos (cobrança, preço, NFC-e). Não estender a outras lojas sem pedido explícito.
