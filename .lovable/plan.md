# Corrigir impressão automática sem perder versões por loja

## Diagnóstico confirmado
- A Bon Appetit está criando pedidos e comandas normalmente.
- Existe uma comanda recente da Bon Appetit pendente na fila, com conteúdo completo; portanto, o problema não está na criação do pedido.
- As permissões necessárias para o Auto Printer ler, concluir e remover itens da fila estão ativas.
- O bloqueio está no programa instalado no computador: ele não está consumindo a fila pendente.
- O arquivo atual mantém comportamentos separados por `company_id` (incluindo os modos exclusivos de Amore Mio e Rei do Açaí). Eles serão preservados.

## Implementação
1. Corrigir o ciclo do `auto_printer.py` para priorizar e processar a fila real antes da consulta auxiliar de pedidos.
2. Impedir que a consulta auxiliar apenas marque um pedido como impresso sem ter enviado uma comanda à impressora.
3. Adicionar diagnóstico claro na tela e no `printer_log.txt` para informar:
   - conexão com a fila;
   - quantidade de comandas encontradas;
   - impressora selecionada;
   - falha ao abrir ou enviar para a impressora;
   - resposta de conclusão da fila.
4. Manter intactas todas as listas, layouts, tamanhos de papel, modos GDI/RAW e demais regras específicas por empresa.
5. Atualizar a versão do Auto Printer e registrar a correção em “Novidades”.
6. Validar o script e o projeto sem criar pedidos, sem imprimir comandas de teste e sem alterar dados fiscais, TEF ou configurações das empresas.
7. Conferir que o download da Bon Appetit continua saindo com o `company_id`, nome da loja, chave pública, papel 80 mm e layout V2 corretos.

## Aplicação na loja
Após a publicação, será necessário baixar novamente somente `auto_printer.py` e `iniciar_impressao.cmd` na Bon Appetit, substituir os dois arquivos e reiniciar o iniciador. A comanda pendente atual ficará disponível para confirmar a impressão real, sem criar pedido de teste.

## Limites de segurança
- Nenhum pedido será apagado ou duplicado.
- Nenhuma fila de outra empresa será zerada.
- Nenhuma versão personalizada de outra empresa será substituída.
- Nenhuma nota será emitida, reemitida ou inutilizada.
- Nenhuma alteração será feita em TEF/PinPad.
