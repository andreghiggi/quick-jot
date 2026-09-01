# Amore Mio — limpar fila de impressão travada

## Situação atual (verificada no banco)

A loja Amore Mio tem **90 impressões pendentes** acumuladas na fila, de 4 dias:

| Dia | Pendentes |
|-----|-----------|
| 28/08 | 14 |
| 29/08 | 24 |
| 30/08 | 26 |
| 01/09 | 26 |

Todas são do tipo "produção" e vêm em pares (Recibo + Produção) dos pedidos B-001 a B-014 de hoje, mais os dias anteriores. Nenhuma foi marcada como impressa, ou seja, se o programa de impressão voltar a rodar, ele tentaria imprimir as 90 de uma vez.

Os pedidos em si estão normais: 33 entregues, 5 pendentes, 2 prontos e 7 cancelados desde 28/08 — o problema é só a fila de impressão.

## O que será feito

Marcar as 90 impressões pendentes da Amore Mio como já processadas, para que nada saia em massa quando o programa de impressão voltar. Nenhum pedido, venda ou nota é alterado.

Escopo restrito à empresa Amore Mio — nenhuma outra loja é tocada.

## Detalhes técnicos

- `UPDATE public.print_queue SET printed = true, printed_at = now() WHERE company_id = 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8' AND printed IS NOT TRUE;`
- Nenhuma alteração de código, schema ou configuração.
- Confirmação após a execução: nova contagem de pendentes deve retornar 0.
