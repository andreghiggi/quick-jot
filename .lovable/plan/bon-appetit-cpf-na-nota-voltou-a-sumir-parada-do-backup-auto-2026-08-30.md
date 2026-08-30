# Bon Appetit: CPF na nota voltou a sumir + parada do backup automático

## Diagnóstico (confirmado no banco)

1. **CPF na nota não aparece mais**
   - O pop-up "CPF/CNPJ na nota?" no diálogo de pagamento só abre quando o sistema considera a loja "com fiscal ativo".
   - Essa verificação passou a ser feita procurando os campos de token fiscal chamados `fiscal_token` e `focus_nfe_token`.
   - A Bon Appetit (e todas as demais lojas) guardam o token com outro nome: `fiscal_flow_api_token`. Consulta feita agora: nenhuma loja do sistema tem `fiscal_token` ou `focus_nfe_token` cadastrado.
   - Resultado: o sistema entende "sem fiscal", pula o pop-up de CPF e ainda força a venda a ser registrada como "somente venda". A NFC-e continua saindo nas vendas com TEF (porque esse caminho usa outra checagem, o módulo Fiscal, que está ativo), por isso as notas seguiram sendo emitidas — mas sempre sem CPF e sem a escolha do operador.
   - Isso bate com o relato de "funcionava até o início da semana": a verificação por token foi introduzida na mudança recente que passou a esconder relatórios fiscais/TEF de lojas sem token.

2. **Backup automático**
   - Existe uma rotina agendada `backup-mirror-daily` rodando todo dia às 03:00 (horário de Brasília). Ela será desativada.

3. **Outros pontos verificados na Bon Appetit** (sem ação necessária no momento)
   - Notas dos últimos 10 dias: 50 autorizadas, 1 presa em "processando" desde 24/08.
   - Histórico antigo: 14 rejeitadas e 2 pendentes (mais antigas, de abril a agosto).
   - Fila de impressão: nada pendente.
   - Logs de TEF com falha: praticamente todos são consultas de status durante a espera do pinpad (comportamento normal), fora 5 cancelamentos legítimos feitos pelo operador.

## Correção proposta

### Parte 1 — Voltar a solicitar o CPF
- Corrigir a detecção de "loja com fiscal ativo" para reconhecer também o campo realmente usado (`fiscal_flow_api_token`), mantendo os nomes antigos por compatibilidade.
- Efeito: o pop-up de CPF/CNPJ volta a aparecer na Bon Appetit ao concluir a forma de pagamento, e a venda volta a ser registrada com o documento escolhido pelo operador.
- Esta é a mesma causa em qualquer loja com token fiscal; a correção é no critério de detecção, sem regra específica por loja e sem mudar nenhum fluxo de emissão, impressão, TEF ou caixa.

### Parte 2 — Parar o backup automático
- Desativar a tarefa agendada diária do backup espelho. A função continua existindo e pode ser disparada manualmente pela tela de monitoramento quando quiser.

## Detalhes técnicos

- Arquivo: `src/hooks/useFiscalEnabled.ts` — incluir `fiscal_flow_api_token` na lista de chaves consultadas em `store_settings` e na verificação `hasToken`.
- Migração: `SELECT cron.unschedule('backup-mirror-daily');` (job id 7, schedule `0 6 * * *` UTC).
- Sem alterações em `PDVV2PaymentDialog.tsx`, `nfce-proxy`, impressão ou qualquer regra por empresa.
- Subir versão para `1.70.4-beta` e registrar no changelog (Novidades).

## Fora de escopo
- Nota presa em "processando" desde 24/08 e rejeitadas antigas: podem ser tratadas depois pelo Monitor NFC-e, se quiser.
