# Reintroduzir o Lovable Cloud com a VPS como origem atual

## Situação confirmada

- O Lovable Cloud está acessível novamente, mas seus dados operacionais param em 13/09; caixas, vendas e notas posteriores não estão completos nele.
- A produção atual está preparada para usar `api.comandatech.com.br`, e o fluxo de publicação atual valida esse endereço.
- Já existem ferramentas de comparação e sincronização VPS → Cloud por identificador, mas elas precisam ser endurecidas antes do uso: a rotina ampla também alcança autenticação e pode incluir filas de impressão; a validação atual de produção ainda exige a VPS.
- Portanto, apenas apontar o aplicativo para o Cloud agora faria as lojas enxergarem uma base desatualizada.

## Plano seguro

1. **Inventário somente leitura**
   - Comparar VPS e Lovable Cloud por loja e por tabela crítica, incluindo quantidade, IDs ausentes, última data e alterações conflitantes.
   - Conferir especialmente usuários, vínculos de lojas, configurações, produtos, pedidos, caixas, vendas, pagamentos, TEF, crediário e registros fiscais.
   - Comparar também arquivos de produtos e documentos armazenados, funções de nuvem, agendamentos e destinos de webhook.

2. **Definir a VPS como fonte do período da indisponibilidade**
   - Preservar no Cloud tudo que só exista nele antes da parada.
   - Importar da VPS somente registros novos ou versões comprovadamente mais recentes.
   - Manter os mesmos IDs e usar `external_id` onde aplicável, evitando duplicidade.
   - Não apagar tabelas, não recriar o projeto e não substituir o banco por uma cópia vazia.

3. **Proteger operações sensíveis**
   - Excluir `print_queue` da sincronização para impedir reimpressões.
   - Não emitir, cancelar, reprocessar ou inutilizar NFC-e/NF-e; copiar apenas o estado já registrado.
   - Preservar chave, protocolo, XML, QR Code, status e numeração de documentos autorizados.
   - Não repetir cobranças TEF nem alterar transações já confirmadas.
   - Tratar caixas abertos e crediário como dados operacionais, sem fechamento automático.

4. **Preparar e validar a sincronização**
   - Criar backup consistente da VPS e uma referência do estado atual do Cloud antes de qualquer escrita.
   - Executar primeiro uma simulação que gere relatório de inclusões, atualizações e conflitos, sem aplicar nada.
   - Ajustar a rotina existente para uma ordem segura de dependências e para não sobrescrever dados mais novos por engano.
   - Validar autenticação e identidades separadamente; validar arquivos por checksum, sem duplicar objetos.

5. **Sincronização inicial com a VPS ainda principal**
   - Copiar em lotes idempotentes os dados faltantes da VPS para o Cloud.
   - Repetir a comparação até zerar diferenças relevantes.
   - Recalcular apenas contadores internos necessários, sempre acima do maior número existente.
   - Confirmar por loja os pedidos, caixas, vendas, pagamentos e documentos fiscais do período da falha.

6. **Virada final com janela curta controlada**
   - Escolher um horário de menor movimento e impedir novas gravações por poucos minutos, sem desligar ou apagar a VPS.
   - Executar o último delta VPS → Cloud.
   - Conferir login, leitura, gravação controlada não fiscal, cardápio, pedidos, caixas, impressão, TEF e integrações.
   - Alterar o frontend de produção, instaladores e webhooks para o Lovable Cloud somente após todas as conferências.

7. **Retorno gradual e reversível**
   - Liberar primeiro uma loja piloto, sem alterar o TEF/PinPad congelado.
   - Acompanhar erros e divergências; depois liberar as demais lojas.
   - Manter a VPS intacta e somente leitura como contingência durante o período de validação.
   - Se qualquer critério falhar, voltar o frontend para a VPS sem sincronização inversa automática.

8. **Encerramento**
   - Registrar a mudança em **Novidades**, atualizar a versão e alinhar os validadores de publicação com o destino Cloud.
   - Entregar relatório final com o que foi copiado, conflitos resolvidos, contagens por loja e confirmações do fiscal, TEF, impressão e autenticação.

## Critérios para autorizar a troca

- Cloud saudável e estável.
- Usuários e vínculos de lojas íntegros.
- Nenhum pedido, venda, pagamento, caixa ou documento fiscal faltando no período em que a VPS foi principal.
- NFC-e autorizadas preservadas com chave, protocolo, XML e QR Code.
- Contadores de venda e fiscais sem regressão ou colisão.
- Nenhum item antigo reinserido na fila de impressão.
- Frontend e webhooks apontando para o mesmo destino.
- Teste piloto aprovado antes da liberação geral.

## Fora deste diagnóstico

Nenhuma sincronização, alteração de dados, emissão fiscal, mudança de endpoint, publicação ou desligamento será feito nesta etapa.
