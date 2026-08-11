# Plano de Implementação: Módulo Balança (Integração Wind D3)

Este plano descreve a implementação do suporte a balanças no sistema, começando pelo modelo **Wind D3**, integrando-a tanto ao PDV (frontend) quanto ao script de comunicação local (Python).

## 1. Módulo de Configuração (Admin/Configurações)
- Criar a aba **Balança** em `Settings.tsx`.
- Opções: 
  - Habilitar Balança (Sim/Não).
  - Modelo da Balança: **Wind D3** (inicialmente).
  - Porta Serial (COM1, COM2, etc - configurável no script local).
  - Baud Rate e Paridade (padrão Wind D3).

## 2. Ajuste no Script Local (Python - auto_printer.py)
- Atualmente o script lida apenas com impressão. Vamos adicionar um servidor local simples ou uma rotina de leitura de porta serial.
- Implementar a leitura do protocolo da **Wind D3** (normalmente envia o peso em formato ASCII sob demanda ou contínuo).
- O frontend fará uma requisição local (ex: `http://localhost:8081/peso`) para obter o valor atual da balança.

## 3. Integração com PDV (Frontend)
- No **PDV V2** e **Pedido Express**, ao selecionar um produto configurado como "Venda por Peso" (kg):
  - Exibir um botão "Ler Balança".
  - Fazer o fetch do peso via script local.
  - Calcular automaticamente o preço total (Peso x Preço unitário).

## Detalhes Técnicos

### Protocolo Wind D3 (Sugestão Inicial)
A balança Wind D3 costuma usar o protocolo P03 ou similar.
- Conexão: RS232 (ou USB-Serial).
- Comando de leitura: `ENQ` (0x05) ou fluxo contínuo.
- Formato de resposta: `[STX][PESO][ETX]` ou similar.

### Alterações nos Arquivos:
- `scripts/auto_printer.py`: Adicionar `pyserial` (opcional, ou usar comandos de sistema) e lógica de leitura.
- `src/pages/Settings.tsx`: Interface para download do script atualizado e configuração do modelo.
- `src/hooks/useStoreSettings.ts`: Adicionar chaves `scale_enabled`, `scale_model`.
- `src/components/PedidoExpressDialog.tsx` e `src/components/pdv/PDVProductList.tsx`: Adicionar lógica de captura de peso.

### Verificação de Viabilidade
- **Frontend**: 100% viável via requisições para o agent local.
- **Agent Local (Python)**: 100% viável, requer que o usuário instale a biblioteca `pyserial` (vamos incluir no `.bat` de instalação).
- **Hardware**: Necessário cabo serial/USB compatível com a Wind D3.
