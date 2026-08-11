# Plano: Atalhos Numéricos para Balança (Venda Rápida)

Propomos a implementação de códigos curtos (ex: "1", "2") para produtos de balança, otimizando o fluxo da Amore Mio na **Venda Rápida**.

## O que será construído
- Campo `scale_barcode` já existe no banco; vamos usá-lo como "Atalho Numérico".
- A **Venda Rápida** agora prioriza a busca por esse código exato antes da busca textual.
- Se o operador digitar "1" e existir um produto com `scale_barcode = '1'`, ele será adicionado instantaneamente (lendo a balança se necessário).

## Detalhes Técnicos
- Alteração no `useMemo` do filtro em `PDVV2FastCheckout.tsx` para detectar entradas numéricas curtas.
- Adição de lógica no `useEffect` do `query` para disparar `handleAddProduct` automaticamente se houver um match exato no `scale_barcode`.
- Atualização da UI de busca para indicar que aceita códigos de balança.

## Como usar
1. No cadastro do produto (ex: Sorvete Kilo), preencha o campo "Código de Balança" com um número (ex: 1).
2. Na Venda Rápida, basta digitar "1" no campo de busca.
3. O sistema identificará o código, capturará o peso e lançará no carrinho sem cliques extras.