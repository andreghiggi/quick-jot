# Floricultura: remessas e mensagens

## Regras implementadas
- Perfil vem de `company_modules`, nunca de um campo inventado em `companies`.
- Destinos persistidos no catálogo continuam com seus identificadores; o leitor é compartilhado pelo painel e pelas funções.
- Confirmação comercial ocorre em **Confirmar**; o recebimento do pedido não simula aprovação de pagamento.
- Retirada: pendente → pronta para retirada → retirada. Entrega: pendente → saiu para entrega → entregue.
- Todas as notificações vão ao telefone persistido do comprador. Não enviar cartão, telefone do destinatário ou resumo financeiro a quem recebe o presente.
- O pedido só conclui depois de todas as remessas. Uma fila única por pedido mantém conclusão depois da última entrega, mesmo com cliques simultâneos.
- Resultado **aceito** significa aceite do serviço, não comprovante de entrega ao celular.
- Falha explícita pode ser reenviada. Timeout ou interrupção gera resultado incerto, exige conferência e confirmação antes de reenviar.
- Estados e mensagens são independentes: falha de WhatsApp não apaga uma entrega registrada.
- A consulta das mensagens acompanha mudanças de etapas e atualização manual, sem adicionar um ciclo periódico de consultas por card.
- Cooldown de saudação e recuperação de sessões não foram alterados.
- Templates florais usam chaves próprias, sem sobrescrever textos salvos de restaurantes ou variáveis legadas.
- Depois da confirmação, itens não são editados pelo card; mudanças externas são detectadas antes da próxima transição para impedir conclusão com snapshot divergente.

## Agendamento e horários
Usa `America/Sao_Paulo`, múltiplos períodos e precedência de sempre aberto. Dias sem configuração, quando existe uma grade semanal, são fechados. Sem grade, mantém sempre aberto. O retorno procura o próximo período válido hoje, amanhã ou no próximo dia de funcionamento.

O convite para agendar só aparece se `accept_order_scheduling` está ligado **e o catálogo permite agendamento naquele momento**. Atualmente o catálogo bloqueia agendamento após o último período do dia e em dias totalmente fechados. Não alteramos essa regra nem prometemos um pedido que o catálogo recusaria. Sem retorno configurado, não inventamos uma hora. Sem link de avaliação, omitimos o bloco Google.

## Implantação
As duas migrações de desenvolvimento possuem espelhos `deploy/sql/*_auto.sql`; aprovar as migrações na VPS antes das funções e do frontend. A implantação de funções verifica as estruturas antes de copiar os arquivos. Nenhuma publicação ou emissão fiscal faz parte desta mudança.

## Validação
Testes puros, transições e concorrência em banco descartável, funções com serviço fictício e visualização controlada não comprovam recepção real. O teste final de WhatsApp e da operação da floricultura exige implantação autorizada na VPS e pedido real da loja; não enviar mensagens de teste a compradores.