# Bon Appetit — pedidos entram na fila de impressão e nada sai na impressora

Escopo: somente a loja Bon Appetit. Diagnóstico com leitura e observação no computador da loja. Nada de alterar pedidos, vendas, caixa, TEF, notas fiscais ou configurações de outras lojas.

## O que já se sabe

- Os pedidos de hoje (21/09), incluindo o #B-717, aparecem como enviados e somem da fila, mas o papel não sai.
- Sumir da fila significa que o programa de impressão da loja leu o pedido, considerou que imprimiu e confirmou a conclusão. Ou seja: a comunicação com o sistema está funcionando; a falha está entre o programa e a impressora do computador.
- Há acesso remoto ao computador da loja, que é onde estão as respostas.

## Hipóteses a confirmar, na ordem (da mais provável para a menos)

1. O programa está enviando para uma impressora diferente da que a loja usa (impressora padrão do Windows trocada, ou a impressora da estação cadastrada não existe mais com aquele nome).
2. A impressora está com trabalhos presos/pausada/offline no Windows — recebe e engasga, sem imprimir.
3. Existe mais de uma cópia do programa rodando (por exemplo em outro computador ou aberta duas vezes) com o mesmo identificador da loja: uma consome e confirma o pedido, a outra nunca vê. Isso explica sumir da fila sem sair papel.
4. O pedido chegou vinculado a uma estação de impressão que não está configurada nesse computador.
5. Modo de impressão incompatível (gráfico x texto) fazendo o envio ser aceito e descartado.

## Etapas do diagnóstico (sem alterar nada)

1. Entrar no computador da loja e observar a janela do programa de impressão enquanto um pedido novo é feito, anotando as mensagens exibidas (qual impressora foi usada, se fala em estação ou impressora padrão, se aparece erro).
2. Conferir na lista de impressoras do Windows: qual está como padrão, se a da loja está pronta (não pausada, não offline) e se existem trabalhos parados na fila dela.
3. Conferir se o nome da impressora cadastrada no painel da loja é exatamente o mesmo nome que aparece no Windows.
4. Verificar se o programa está aberto uma única vez e apenas nesse computador, e se está usando o identificador correto da Bon Appetit.
5. Fazer um teste de impressão direto pelo Windows na mesma impressora, para separar problema do sistema de problema do equipamento.
6. Com essas informações, apontar a causa única e propor a correção mínima (ajuste de impressora, do cadastro da estação ou do modo de impressão), aplicada só na Bon Appetit.

## Sobre o #B-717

O pedido não será reimpresso nem alterado durante o diagnóstico. Depois da causa confirmada e corrigida, ele pode ser reimpresso a pedido, pela própria tela de pedidos.

## Detalhes técnicos

- Fluxo: a tela grava a comanda em `print_queue` (com `company_id`, `station_id`, `html_content`); o `auto_printer.py` busca `printed=false`, imprime e marca `printed=true`, depois apaga o registro. Sumir da fila = `imprimir_html` retornou sucesso.
- Quando `station_id` não resolve para uma impressora em `print_stations.printer_name`, o programa cai em `win32print.GetDefaultPrinter()` — origem clássica de "imprimiu" em impressora errada (inclusive PDF/OneNote).
- Bon Appetit (`32b71649-461d-4cb6-b26c-12390b090feb`) precisa ser checada quanto ao modo GDI (`GDI_COMPANY_IDS`) e ao `store_settings.printer_paper_size` / `print_layout`.
- A produção roda na VPS (`api.comandatech.com.br`); esta sessão não tem chave de leitura dessa base, então a leitura de `print_queue`, `print_stations` e `store_settings` da loja será feita pelo painel ou no próprio computador da loja.
