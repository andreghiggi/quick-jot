# Corrigir erro ao enviar comanda de mesa para a impressora

## O que está acontecendo

O envio de comanda das telas de mesa (app do garçom e PDV V2, inclusive recibo) falha antes mesmo de chegar na impressora. O código dessas telas pede ao banco informações de impressora que hoje não existem: procura por "estação padrão", "estação ativa" e "estação que imprime recibo", e tenta gravar na fila um campo de pedido de origem que a fila não tem.

Confirmado no banco: a tabela de estações de impressão tem apenas identificador, empresa, nome e nome da impressora; a fila de impressão tem apenas empresa, conteúdo, rótulo, estação, tipo e status. Nenhum dos campos usados por essas telas existe.

Por isso o erro não é da Bon Appetit: atinge todas as lojas que usam mesa/comanda por essas telas. Os pedidos vindos do cardápio e do fluxo antigo continuam imprimindo porque usam outro caminho, que não pede esses campos.

## Correção proposta

Alinhar o envio de comanda ao que o banco realmente tem, sem mudar layout, TEF, fiscal nem dados:

1. Ao carregar as estações, buscar apenas nome e identificador (sem "ativa" e sem "padrão"). Se a loja não tiver estação cadastrada, a comanda vai para a fila geral, como já acontecia.
2. Escolher a primeira estação cadastrada como destino padrão dos itens sem categoria mapeada.
3. Recibo: enviar para a fila sem procurar "estação que imprime recibo" (usa a estação padrão da loja, ou fila geral).
4. Remover o campo de pedido de origem das inserções na fila.
5. Mostrar mensagem de erro real ao usuário quando a inserção na fila falhar, em vez de falhar em silêncio.

Alternativa possível (não incluída): criar essas colunas no banco. Ficaria mais complexo e mexeria em estrutura, então a proposta é ajustar só o aplicativo.

## Detalhes técnicos

Arquivos afetados:
- `src/utils/printRouting.ts` — `loadRouting` (select sem `is_default`/`active`), `enqueueProductionByStationParams` (remover `source_order_id`), `enqueueReceiptJob` (remover filtro `handles_receipt` e `source_order_id`).
- `src/pages/Waiter.tsx` e `src/utils/pdvV2Print.ts` — apenas propagação/exibição de erro se necessário.

Não serão alterados: `enqueueProductionByStationLegacy` (fluxo de pedidos do cardápio/PDV V2 avanço de status), `scripts/auto_printer.py`, listas GDI por loja, layouts 58/80 mm, TEF e fiscal.

## Validação

- Verificar o build/typecheck sem erros.
- Conferir na Bon Appetit que uma comanda de mesa nova cria registro pendente na fila com conteúdo HTML.
- Confirmar que lojas sem estações cadastradas continuam recebendo um único job geral.
