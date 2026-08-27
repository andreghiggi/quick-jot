---
name: Pedido Express Amore Mio — status e WhatsApp
description: Status inicial do pedido express na Amore Mio e disparo das mensagens de WhatsApp
type: feature
---
Amore Mio (f5f9eec3-67bc-497a-88a6-ce41d3b15df8), Pedido Express finalizado (`finalizeNow`):
- Cliente Loja -> pedido criado com status `delivered` (sai da dashboard, soma no caixa).
- Cliente com telefone/nome -> pedido criado com status `preparing`, liberando "Pronto" e depois "Entregar".
- Ao criar (preparing), `src/utils/expressWhatsappNotify.ts` envia confirmação do pedido e, 1,5s depois, a mensagem de "em preparo" (best-effort, só com módulo WhatsApp ativo e instância conectada).
- "Pronto" e "entregue" continuam saindo por `updateOrderStatus` em `useOrders.ts`.
