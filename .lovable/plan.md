# Segunda impressora não é reconhecida — diagnóstico e correção (Amore Mio)

## O que foi verificado agora

- Estação cadastrada: **cozinha**, com nome de impressora **"cozinha"** (`print_stations`).
- Vínculo existente: categoria **Sorvete → estação cozinha** (`category_print_stations`).
- Fila de impressão da loja (`print_queue`): **todos os jobs saíram com estação vazia** (`station_id = null`) — por isso tudo cai na impressora padrão.
- Permissões e política de leitura anônima de `print_stations` estão corretas (o script consegue ler o cadastro).
- Script `auto_printer.py` v1.7.0 já resolve `station_id → printer_name` corretamente.

## Causa raiz

O roteamento nunca descobre a categoria do item, então nunca acha a estação:

- Na **Venda Rápida**, os itens do carrinho são montados só com `product_id`, nome, quantidade e preço — **sem categoria**. O código que envia para impressão lê `item.category`, que vem `undefined`.
- Nos **pedidos** (PDV V2 / cardápio), os itens vindos de `order_items` também não trazem `category` nem `category_id`.

Resultado: `printRouting` cai sempre no grupo "sem estação" → job com `station_id = null` → impressora padrão do Windows. O problema é no sistema, não no script nem no cadastro.

## Correção em 3 passos (somente Amore Mio no piloto, sem tocar em layout V2)

1. **Resolver a categoria pelo produto dentro do roteamento**
   Em `src/utils/printRouting.ts`, quando o item não trouxer categoria, buscar `products.id, category, category_id` pelos `product_id` dos itens e usar isso para achar a estação. Isso conserta os dois fluxos de uma vez (Venda Rápida e pedidos) sem alterar quem chama.

2. **Enviar a categoria já na Venda Rápida**
   Em `PDVV2FastCheckout.tsx`, gravar `category` e `category_id` no item do carrinho ao adicionar o produto, para o roteamento não depender só da busca extra.

3. **Validar ponta a ponta**
   - Conferir que o nome cadastrado na estação é **exatamente** o nome da impressora compartilhada no Windows (hoje está `cozinha`; se a impressora aparece como `\\PC-CAIXA\cozinha` ou `POS-58`, precisa ser esse texto).
   - Vincular as demais categorias que devem sair na segunda impressora (hoje só **Sorvete** está vinculada).
   - Gerar um pedido de teste com itens de duas categorias e confirmar na fila que saem **dois jobs**, um com `station_id` preenchido, e que o script loga `Usando impressora mapeada`.

## Detalhes técnicos

- `printRouting.ts`: uma consulta adicional `products.select('id, category, category_id').in('id', productIds)`, montando `productId → categoryId`; ordem de resolução passa a ser `item.category_id → produto.category_id → categoria por nome`.
- Nenhuma mudança em `generateProductionTicketHTML`, no HTML V2, no `iniciar_impressao.cmd` ou em outras lojas.
- O `auto_printer.py` não precisa mudar — a loja continua com a v1.7.0.
