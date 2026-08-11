# Gaveta de Caixa (Cash Drawer)

Integração de abertura automática de gaveta física via impressora térmica (comando ESC/POS).

## O que temos
- Toggle `auto_open_drawer_cash` nas `pdv_settings` (Frente de Caixa).
- Lógica de impressão centralizada em `nfceService.ts` e `crediarioReceiptPrint.ts`.
- Módulo `mercado` (Frente de Caixa) já possui infraestrutura para configurações do PDV.

## O que precisamos implementar
1. **Configuração de Modelo**: Adicionar seleção de modelo de gaveta/impressora nas configurações.
2. **Protocolo ESC/POS**: Implementar o envio do pulso elétrico (geralmente `ASCII 27, 112, 0, 25, 250` ou `27, 112, 48`) via interface de impressão.
3. **Compatibilidade Elgin/Bematech**: Mapear os comandos específicos dessas marcas (embora a maioria siga o padrão Epson).
4. **Trigger no PDV**: Acionar a abertura no momento da finalização do pagamento em dinheiro ou manualmente por atalho.
5. **Integração com Servidor Local**: Para impressoras USB/Serial, utilizar o agente local (similar ao `auto_printer.py`) para enviar os comandos binários puros.

## Plano de Ação
- [ ] Adicionar campos `drawer_model` e `drawer_command` em `pdv_settings`.
- [ ] Atualizar `FrenteCaixaConfiguracoes.tsx` com a nova aba de "Periféricos".
- [ ] Criar utilitário `drawerService.ts` para abstrair os comandos ESC/POS.
- [ ] Integrar chamada de abertura no fluxo de checkout da Frente de Caixa.
