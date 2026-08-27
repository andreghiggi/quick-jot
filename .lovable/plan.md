# Atalho de tecla (Ctrl) para produto na Venda Rápida — Amore Mio

## Objetivo
Na Venda Rápida da Amore Mio, pressionar **Ctrl** seleciona instantaneamente um produto específico e abre o campo para informar o valor (reaproveitando o fluxo de "produto sem preço" já existente). O vínculo tecla ↔ produto é configurável no cadastro do produto.

## Como o vínculo funciona
1. **Cadastro do produto** (`ProductEdit.tsx`): novo campo "Tecla de atalho na Venda Rápida" (ex.: Nenhuma / Ctrl). Visível apenas para a Amore Mio. Salvo em nova coluna `products.fast_hotkey` (texto).
2. **Venda Rápida** (`PDVV2FastCheckout.tsx`): um listener de teclado (`keydown`) fica ativo enquanto a tela está aberta. Ao pressionar a tecla configurada (Ctrl):
   - Busca o produto da loja que tem `fast_hotkey = 'Control'`.
   - Chama o mesmo fluxo de adicionar produto: se o produto não tem preço cadastrado, abre automaticamente o diálogo "Informar preço" (já existente) com o campo de valor focado; se tem preço, adiciona direto ao carrinho.

## Regras de segurança do atalho
- Só dispara na Amore Mio (`companyId` isolado — nenhuma outra loja é afetada).
- Não dispara se houver diálogo aberto (cobrança, informar preço, NFC-e) para não conflitar.
- `preventDefault()` para evitar comportamentos do navegador.
- Se mais de um produto tiver a mesma tecla, usa o primeiro encontrado.
- Funciona mesmo com o cursor no campo de busca (Ctrl é tecla modificadora, não interfere na digitação).

## Alterações técnicas
- **Migração SQL**: `ALTER TABLE products ADD COLUMN fast_hotkey text;` (sem RLS novo — coluna em tabela existente).
- **`src/hooks/useProducts.ts`**: mapear `fast_hotkey` → `fastHotkey` no select/insert/update.
- **`src/pages/ProductEdit.tsx`**: campo select "Tecla de atalho na Venda Rápida" (opções: Nenhuma, Ctrl), renderizado só para Amore Mio.
- **`src/components/pdv-v2/PDVV2FastCheckout.tsx`**: `useEffect` com listener `window.addEventListener('keydown')` que localiza o produto pelo `fastHotkey` e chama `handleAddProduct`.
- **`src/version.ts`**: bump de versão + registro no Changelog (Novidades), conforme padrão do projeto.

## Validação
- Cadastrar a tecla Ctrl em um produto da Amore Mio sem preço → abrir Venda Rápida → pressionar Ctrl → diálogo de valor abre → informar valor → item entra no carrinho → finalizar venda normalmente.
- Confirmar que outras lojas não exibem o campo nem respondem à tecla.
