# Integração de Gaveta de Caixa (Elgin/Bematech)

Implementação do suporte a abertura automática de gavetas de dinheiro via comandos ESC/POS enviados pela impressora térmica.

## O que temos hoje
- Infraestrutura de `pdv_settings` para a Frente de Caixa.
- Toggle `auto_open_drawer_cash` já existente no banco de dados (mas sem lógica de acionamento real de hardware).
- Impressão baseada em HTML/Browser para NFC-e e Crediário.

## O que vamos implementar
1. **Configurações**: Novo card em `FrenteCaixaConfiguracoes.tsx` para selecionar o modelo da gaveta e o método de conexão.
2. **Protocolo ESC/POS**: Utilitário para gerar o comando binário de abertura (`CHR(27) + "p" + CHR(0) + CHR(25) + CHR(250)`).
3. **Agente de Impressão (Fase 1)**: Para gavetas USB/Serial conectadas à impressora, utilizaremos o `nfce-proxy` ou o instalador local para despachar o comando de "Pulse" (abertura).
4. **Trigger**: Acionamento automático ao finalizar vendas em Dinheiro e botão manual "Abrir Gaveta" na sidebar.

## Detalhes Técnicos
- **Modelos**: Elgin, Bematech, Epson (padrão ESC/POS).
- **Interface**: A gaveta é conectada via cabo RJ11 na impressora. O comando de abertura é enviado para a impressora, que repassa o pulso elétrico para a gaveta.

## Próximos Passos
- Adicionar `drawer_model` e `drawer_connection_type` ao `usePdvSettings`.
- Implementar aba "Periféricos" na configuração.
- Criar a lógica de disparo no checkout da Frente de Caixa.
