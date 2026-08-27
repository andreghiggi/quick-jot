# Amore Mio — status do Pedido Express após "Enviar para Cozinha"

Hoje, no Pedido Express da Amore Mio, todo pedido cobrado e enviado para a cozinha nasce com o mesmo status ("Pronto"), sem diferenciar cliente identificado de "Cliente Loja".

## Comportamento desejado (só Amore Mio)

- **Pedido com telefone/nome do cliente**: ao enviar para a cozinha, o pedido entra como **Em preparo**, ficando visível na dashboard com o botão **Pronto** liberado — assim o operador avisa quando o pedido ficar pronto e depois usa **Entregar**.
- **Pedido "Cliente Loja"**: continua como hoje — já nasce **Entregue**, sai da dashboard, aparece na aba de pedidos e o valor entra no caixa. Nenhum botão de avanço é exibido.

Nas duas situações a cobrança continua acontecendo antes do envio, e recibo + comanda de produção continuam saindo com o mesmo número (B-00X).

## Avisos no WhatsApp (pedidos com telefone)

Para os pedidos do Pedido Express com telefone informado:

- Ao enviar para a cozinha: o cliente recebe a **confirmação do pedido** e, em seguida, a mensagem de **em preparo**.
- Ao clicar em **Pronto**: recebe a mensagem de pedido pronto (retirada ou entrega, conforme o tipo).
- Ao clicar em **Entregar**: recebe a mensagem de pedido entregue.

As mensagens usam os modelos já configurados na loja (Configurações de WhatsApp) e só saem se o módulo WhatsApp estiver ativo e a instância conectada. "Cliente Loja" não recebe mensagem (não tem telefone).

## Escopo

- Nenhuma outra loja muda de comportamento.
- Nada de TEF, NFC-e, impressão ou layout é alterado — apenas o status inicial do pedido e o disparo das mensagens.

## Detalhes técnicos

- `src/components/PedidoExpressDialog.tsx`, na criação do pedido (`addOrder`):
  - status atual: `override?.finalizeNow ? 'ready' : 'pending'`.
  - novo: quando `isAmoreMio && override?.finalizeNow`, usar `customerName.trim() === 'Cliente Loja' ? 'delivered' : 'preparing'`; demais lojas mantêm a regra atual.
- Mensagens de "pronto" e "entregue" já são disparadas por `updateOrderStatus` em `src/hooks/useOrders.ts` (Evolution API + templates de `store_settings`) — nada a mudar nesses dois passos.
- Como o pedido da Amore Mio nasce direto em `preparing`, não há transição de status para disparar as duas primeiras mensagens. Após `addOrder` com sucesso e telefone presente: chamar `sendConfirmationWhatsApp(orderId)` e, na sequência, o envio da mensagem de `preparing` (mesma rotina de notificação já usada em `updateOrderStatus`, extraída para uma função reutilizável `notifyOrderStatus(orderId, status)` no hook), com um pequeno intervalo entre as duas.
- Envio best-effort: falha de WhatsApp não bloqueia a criação/impressão do pedido.
- `OrderCard` já mapeia `preparing → botão "Pronto"` e não mostra avanço em `delivered`, então nenhuma mudança é necessária lá.
- Versão: subir para `1.70.2-beta` em `src/version.ts` com entrada no changelog.

