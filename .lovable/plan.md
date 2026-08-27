# Amore Mio — status do Pedido Express após "Enviar para Cozinha"

Hoje, no Pedido Express da Amore Mio, todo pedido cobrado e enviado para a cozinha nasce com o mesmo status ("Pronto"), sem diferenciar cliente identificado de "Cliente Loja".

## Comportamento desejado (só Amore Mio)

- **Pedido com telefone/nome do cliente**: ao enviar para a cozinha, o pedido entra como **Em preparo**, ficando visível na dashboard com o botão **Pronto** liberado — assim o operador avisa quando o pedido ficar pronto e depois usa **Entregar**.
- **Pedido "Cliente Loja"**: continua como hoje — já nasce **Entregue**, sai da dashboard, aparece na aba de pedidos e o valor entra no caixa. Nenhum botão de avanço é exibido.

Nas duas situações a cobrança continua acontecendo antes do envio, e recibo + comanda de produção continuam saindo com o mesmo número (B-00X).

## Escopo

- Nenhuma outra loja muda de comportamento.
- Nada de TEF, NFC-e, impressão ou layout é alterado — apenas o status inicial do pedido.

## Detalhes técnicos

- `src/components/PedidoExpressDialog.tsx`, na criação do pedido (`addOrder`):
  - status atual: `override?.finalizeNow ? 'ready' : 'pending'`.
  - novo: quando `isAmoreMio && override?.finalizeNow`, usar `customerName.trim() === 'Cliente Loja' ? 'delivered' : 'preparing'`; demais lojas mantêm a regra atual.
- `OrderCard` já mapeia `preparing → botão "Pronto"` e não mostra avanço em `delivered`, então nenhuma mudança é necessária lá.
- Versão: subir para `1.70.2-beta` em `src/version.ts` com entrada no changelog.
