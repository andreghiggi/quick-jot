# Plano de Implementação: Venda Ágil por Peso no PDV V2 (Balança Wind D3)

Este plano foca em transformar o lançamento de itens por peso (como sorvete) em uma operação de um clique, integrando a balança diretamente ao fluxo do PDV V2.

## Como funcionará na tela (Exemplo do Sorvete):

1. **Seleção Direta**: O operador clica no botão "Sorvete" (ou digita o código).
2. **Captura Automática**: O sistema detecta que é um produto por KG e já "puxa" o peso da balança instantaneamente (ex: 0,450 kg).
3. **Lançamento Imediato**: O item entra no carrinho já com o valor calculado (ex: 0,450 x R$ 60,00 = R$ 27,00) sem abrir nenhuma tela extra ou burocracia.
4. **Finalização**: Se for apenas o sorvete, o operador já clica em "Receber" e finaliza. Tudo em menos de 5 segundos.

## Etapas Técnicas:

### 1. Configuração da Balança
- Nova aba em **Configurações** para ativar a balança e definir o modelo (**Wind D3**).
- Script local (`auto_printer.py`) atualizado para ler a porta serial e servir o peso para o navegador.

### 2. Identificação de Produtos "Peso"
- Campo no cadastro de produtos para marcar como "Usa Balança".
- Unidade de medida configurada como "kg".

### 3. "Fast Path" no PDV V2
- Ao selecionar um produto de balança no `PDVV2AddItemSearch` ou `PDVV2CategoryBrowser`, o sistema pula o wizard de opcionais (se não houver obrigatórios) e realiza a leitura do peso via API local.
- Feedback visual rápido de "Lendo balança..." caso haja atraso na comunicação.

### 4. Integração com Comandas
- O peso lido pode ser lançado direto em uma comanda aberta (Mesa/Ficha) com o mesmo fluxo simplificado.
