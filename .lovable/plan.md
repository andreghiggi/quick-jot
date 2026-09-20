# Retomar o ComandaTech com mínimo impacto

## Resultado desejado

Restabelecer o funcionamento anterior à indisponibilidade com esta divisão:

```text
Lovable: desenvolvimento e manutenção do frontend
        ↓ publicação controlada
VPS: app.comandatech.com.br + api.comandatech.com.br
     banco, login, funções, arquivos, webhooks e integrações
```

A VPS permanece como fonte única da produção. O Lovable Cloud não receberá gravações operacionais, webhooks ou sincronização automática durante a estabilização, evitando duas bases divergentes.

## Situação confirmada

- `app.comandatech.com.br` e a autenticação de `api.comandatech.com.br` respondem.
- O fluxo automático do repositório está configurado para publicar o frontend na VPS e exigir a API da VPS.
- Existe também um script local de publicação com validação contrária, exigindo o Cloud; essa divergência deverá ser eliminada antes de qualquer nova publicação.
- Esta sessão não possui chave SSH direta da VPS. O repositório possui um caminho de acesso por publicação automatizada, mas o acesso efetivo à máquina ainda precisa ser comprovado com uma verificação somente leitura antes de qualquer mudança.
- A Lancheria da I9 será a primeira loja validada. O TEF/PinPad homologado continuará congelado: não haverá alteração em seu código ou configuração sem autorização separada.

## Etapas, do menor para o maior risco

### 1. Congelar e registrar o estado atual — somente leitura

- Não publicar, sincronizar ou alterar banco nesta etapa.
- Registrar versão do frontend em produção, destino da API, saúde do login, banco, funções, arquivos, webhooks e agendamentos da VPS.
- Fazer inventário por loja de usuários, módulos, cardápio, opcionais, formas de pagamento, configurações fiscais, caixas, vendas, crediário, impressão e TEF.
- Identificar diferenças entre código, instaladores e configurações ativas sem tentar corrigi-las ainda.

**Saída:** relatório do estado atual e lista exata de divergências por loja.

### 2. Confirmar acesso e preparar retorno seguro

- Comprovar acesso à VPS por comando somente leitura, preferencialmente pelo caminho automatizado já configurado; nenhuma senha ou chave será exibida.
- Confirmar que há backup utilizável do banco, funções, arquivos e frontend atual antes de alterações.
- Guardar o bundle atualmente publicado para retorno imediato.
- Definir uma janela curta de menor movimento com responsável da I9 disponível.

**Bloqueio:** nenhuma alteração na VPS começa sem acesso comprovado e cópia de retorno confirmada.

### 3. Fixar uma única configuração de produção

- Padronizar todos os validadores e publicadores para que o frontend de produção use somente `api.comandatech.com.br`.
- Manter o site hospedado na VPS; a Lovable continua sendo usada para desenvolver e preparar o frontend.
- Garantir que funções, webhooks fiscais, WhatsApp, backups e arquivos de produção apontem somente para a VPS.
- Desativar apenas os caminhos automáticos que poderiam gravar simultaneamente no Lovable Cloud; não apagar nem substituir o conteúdo existente no Cloud.
- Preparar a mudança em staging e validar o pacote antes de tocar no site ativo.

**Retorno:** restaurar o bundle e as configurações anteriores, sem sincronização inversa de dados.

### 4. Restaurar configurações por loja, sem alterar operações financeiras

Comparar e corrigir somente quando houver divergência comprovada:

- login, usuário e vínculo com a empresa;
- módulos ativos e permissões;
- cardápio, categorias, produtos, opcionais, combos, horários e bairros;
- formas de pagamento e regras de entrega/retirada;
- impressoras, estações, categorias roteadas, instalador e versão do `auto_printer`;
- caixa, crediário e configurações fiscais;
- TEF/PinPDV por loja, preservando exatamente os pilotos e versões homologadas.

Cada ajuste será idempotente, restrito à empresa correta e acompanhado de comparação antes/depois. Filas antigas de impressão não serão recriadas.

### 5. Piloto controlado na Lancheria da I9

Validar primeiro sem gerar movimentação financeira artificial:

1. login e permanência da sessão;
2. carregamento do cardápio e configurações;
3. pedido real acompanhado, com adicionais e modalidade correta;
4. chegada do pedido e impressão nas estações esperadas;
5. abertura/uso do caixa já operacional;
6. acompanhamento de uma venda real da loja para conferir pagamento, TEF e registro da venda;
7. emissão fiscal somente no fluxo real da loja — nunca nota de teste, reemissão, cancelamento ou inutilização para validar sistema;
8. conferência de crediário, fechamento e recibos sem alterar o TEF congelado.

A I9 permanece no piloto por uma janela operacional combinada. Qualquer falha interrompe a expansão e aciona o retorno do frontend anterior.

### 6. Liberação gradual das demais lojas

- Liberar em pequenos grupos, priorizando primeiro lojas sem TEF e depois lojas com integrações específicas.
- Antes de cada grupo, conferir sua configuração de impressão, pagamentos, cardápio, caixa e fiscal.
- Após cada grupo, comparar erros, vendas registradas, pedidos, filas novas de impressão e estados fiscais.
- Não avançar enquanto houver venda sem registro, pedido sem impressão, TEF divergente ou documento fiscal incompleto.

### 7. Estabilização e contingência

- Monitorar continuamente disponibilidade, login, erros de API, funções, webhooks, impressão, TEF e fiscal.
- Manter backups automáticos e validar restauração sem restaurar sobre produção.
- Manter o Lovable Cloud preservado como referência/contingência, mas sem atuar como segunda fonte de dados.
- Não fazer sincronização VPS → Cloud até a produção estar estável e existir um plano separado, simulado e aprovado para isso.

### 8. Encerramento

- Confirmar por loja que login, cardápio, pedidos, impressão, pagamentos, TEF, caixa, crediário e fiscal funcionam como antes.
- Registrar versão e mudança em **Novidades**.
- Entregar relatório do que foi realmente alterado, evidências antes/depois, lojas liberadas e qualquer pendência.

## Regras de segurança

- Nenhum dado será apagado, resetado ou substituído em massa.
- Nenhuma NFC-e/NF-e será emitida, reemitida, cancelada ou inutilizada fora de uma operação real da loja.
- Nenhuma cobrança TEF será criada para teste.
- `print_queue` histórica não será migrada nem reaberta.
- IDs e `external_id` serão preservados; operações repetidas não poderão duplicar dados.
- Alterações serão feitas por loja e por etapa, com validação antes/depois.
- O avanço entre etapas dependerá de critérios objetivos; tentativa falha não será informada como mudança aplicada.

## Critérios de sucesso

- Clientes entram e permanecem conectados.
- Cada loja enxerga seu próprio cardápio, configurações e dados.
- Pedidos chegam uma única vez e imprimem na estação correta.
- Vendas, pagamentos e caixas ficam registrados sem colisão ou perda.
- TEF/PinPDV opera nas mesmas lojas e versões anteriores.
- Documentos fiscais mantêm número, chave, protocolo, XML e QR Code.
- Webhooks, arquivos e backups usam somente a VPS de produção.
- O frontend pode ser atualizado pela Lovable e publicado na VPS com retorno rápido para a versão anterior.
