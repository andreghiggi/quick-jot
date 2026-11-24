# Controle rápido de atendimento

- `store_availability_override` é uma chave nova na tabela existente `store_settings`, por `company_id`. Sem migração ou alteração de horários semanais.
- A chave contém `mode` e a data local em `America/Sao_Paulo`; só vale nessa data. Nenhuma loja é modificada até o operador clicar.
- O controle aparece abaixo do nome no PDV V2 e no cabeçalho de Dashboard/Pedidos. Abrir/fechar atendimento nunca abre/fecha caixa, cobra, emite nota ou altera pedidos e remessas existentes.
- Fechamento excepcional bloqueia novos pedidos online, incluindo agendamento; abrir excepcionalmente permite atendimento hoje, retomando a grade no dia seguinte.
- Cache compartilhado por empresa, consulta a cada 10 segundos enquanto a tela está ativa e ao retornar à janela. O envio de pedido consulta novamente, mesmo com carrinho já aberto.
- QR de mesa mantém seu comportamento anterior sem override; a função também bloqueia novos itens antes de criar comanda quando há fechamento excepcional.
- Saudação WhatsApp de cada perfil segue o mesmo estado, preservando cooldown e fluxo transacional; nenhum reinício de conexão nem envio em massa.
- Deploy autorizado precisa incluir frontend e funções `whatsapp-webhook`, `mesa-public` e `notify-store-order` na VPS. Nenhuma publicação foi disparada.

## Validação

- Vitest: regras de horário/data, retomada à meia-noite de São Paulo, preservação sem chave, fechamento e reabertura, isolamento, erros e variação floral.
- Handlers: testes de QR e WhatsApp com banco/provedor isolados; sem pedidos ou mensagens reais.
- Navegador: componente real do PDV em 1268×639 e 390×844, banco e contexto isolados; fechar, reler após recarregar e reabrir passaram, caixa preservado, sem transbordamento horizontal ou erros.
- Sessão real: revendedor autenticado acessa sua lista, mas acesso à loja é recusado; validação operacional real permanece pendente até acesso autorizado na VPS.