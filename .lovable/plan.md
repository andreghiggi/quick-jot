# Pedido Express mais rápido

## O que o print mostra
- O Pedido Express fica em "Carregando produtos..." enquanto o catálogo da loja é baixado.
- Os avisos amarelos mostram que a verificação de módulos (financeiro, cardápio, PDV V2, mercado) levou mais de 2,5s para responder. O servidor ainda está lento para esta loja (Bon Appétit).

## Causa no Pedido Express
O catálogo é baixado **duas vezes** ao abrir o Pedido Express:
1. O próprio diálogo baixa produtos e categorias.
2. A lista de categorias dentro dele baixa tudo de novo (produtos, categorias e subcategorias).

Cada abertura dispara o dobro das consultas pesadas.

## Correção
1. **Baixar uma vez só:** o diálogo passa a lista de produtos e categorias que já carregou para a lista de categorias. A lista só busca por conta própria quando ninguém entregou os dados (o Garçom continua igual).
2. **Lembrar o catálogo por alguns minutos:** reabrir o Pedido Express no mesmo aparelho usa o catálogo já baixado na hora e atualiza em segundo plano, em vez de esperar de novo.
3. **Mostrar o que já se sabe:** enquanto atualiza, a lista mostra os produtos guardados, sem tela vazia.

Preço, regras de pedido, impressão, TEF e fiscal não mudam.

## Detalhes técnicos
- `PDVV2CategoryBrowser`: novas props opcionais `products`, `categories`, `subcategories`, `loading`. Os hooks internos só buscam quando as props não forem passadas (guardado pelo `companyId` nulo).
- `PedidoExpressDialog`: passa `products` / `categories` / `productsLoading` que já possui.
- `useProducts` / `useCategories`: cache em memória por `companyId` (TTL de 2 min, com dedupe de requisições em andamento), no mesmo padrão de `companyModulesCache`; a atualização por realtime invalida o cache.
- Teste: duas montagens simultâneas para a mesma loja → uma única busca.
