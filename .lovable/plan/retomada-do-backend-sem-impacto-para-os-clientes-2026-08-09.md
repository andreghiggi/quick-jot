# Retomada do backend (sem impacto para os clientes)

## Situação atual
A verificação de status confirma: o banco de dados hospedado está **pausado**. O frontend continua no ar, mas login, pedidos, PDV, cardápio e NFC-e falham enquanto isso.

## O que será feito
1. Executar a retomada do backend (operação aprovada por você no card de confirmação).
2. Reconsultar o status até ficar saudável antes de declarar concluído.
3. Fazer uma verificação de leitura simples (consulta leve numa tabela) para confirmar que o banco responde.
4. Confirmar que as funções e os jobs agendados (backup 03:00, campanhas, limpeza de logs) voltaram a rodar.

## Impacto nos clientes
- Nenhum dado é apagado ou alterado: pedidos, vendas, NFC-e, crediário, usuários, imagens e configurações permanecem como estavam.
- Não haverá mudança de código nem de esquema do banco.
- Durante os primeiros instantes da retomada as chamadas podem ficar lentas ou falhar; depois normaliza sozinho.
- Execuções agendadas que caíram no período de pausa não são recuperadas retroativamente.

## Se a retomada falhar de novo
As tentativas anteriores foram recusadas pela infraestrutura. Nesse caso o próximo passo é verificar plano/cobrança do workspace e, persistindo, acionar o suporte — sem qualquer alteração no projeto.
