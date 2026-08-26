# Amore Mio — igualar a impressão aos PDFs de referência

Escopo estrito: apenas o renderizador gráfico (GDI) usado pela Amore Mio em `scripts/auto_printer.py`. Nenhuma outra loja, pedido, fila, TEF ou NFC-e é tocada.

## Diferenças confirmadas (foto x PDFs)

Comanda de produção:
- O nome do item é **cortado na margem direita** ("Œxepe Francês Morango e 1"), porque o nome é desenhado como coluna direita sem quebra de linha. No PDF ele aparece como `1x  Bolo cenoura`, com o nome quebrando em várias linhas quando necessário.
- A linha de previsão sai invertida: **"20:41 Pronto até:"** em vez de **"Pronto até: 20:41"**.
- O bloco de cabeçalho do PDF tem moldura/linha separando cabeçalho e itens; na impressão só existe a faixa preta do cliente.

Recibo:
- Faltam os **separadores tracejados**, o bloco **PAGAMENTO / modalidade**, o **Subtotal** e o rodapé **"Obrigado pela preferência!"**.
- Há **sobreposição de linhas**: a data/hora final imprime por cima da linha "Pagamento", ou seja, o avanço vertical do bloco não considera linhas quebradas.
- O item sai em fonte pequena e fraca com o preço espremido na mesma linha; no PDF o item é `1x  Nome` e o valor vem em destaque na linha seguinte.
- O código do pedido (2140FF) sai claro/miúdo demais e o "Pronto até" tem peso menor que no PDF.

## Correção em 3 etapas

### 1. Quebra de linha e avanço vertical corretos
- Toda coluna direita (nome do item, valor) passa a participar da medição: quando não couber ao lado, quebra para a linha seguinte em vez de ser cortada.
- A altura do bloco passa a ser calculada pelo número real de linhas renderizadas (esquerda e direita), eliminando as sobreposições do rodapé.

### 2. Estrutura fiel dos dois documentos
- Comanda: `TÍTULO` / `>> MODALIDADE <<` / `PEDIDO B-036` / faixa preta do cliente / data / `Pronto até: HH:MM` (ordem corrigida) / linha separadora / itens `Nx  Nome` / `--- FIM ---`.
- Recibo: nome da loja / pedido / código / faixa preta do cliente / `Pronto até` / separador tracejado / itens com valor / separador / `Subtotal` e `TOTAL` alinhados à direita / `Pagamento` / separador / data-hora / `Obrigado pela preferência!`.
- Separadores tracejados passam a ser desenhados na largura útil do papel, como nos PDFs.

### 3. Tipografia igual à referência
- Ajuste de tamanhos e pesos por estilo para bater com os PDFs: título/pedido/modalidade grandes e negrito, cliente em faixa preta, data e "Pronto até" em corpo médio-negrito, itens em corpo legível (sem cinza), total em destaque.
- Validação com os dois HTMLs (comanda e recibo) gerando um PDF de 80 mm e conferindo visualmente contra `TESTE_COMNDA_V39-3.pdf` e `TESTE_V39-3.pdf`.

## Critérios de aceite

- Nenhum texto cortado na margem direita e nenhuma linha sobreposta.
- Recibo contém subtotal, total, pagamento, separadores e rodapé de agradecimento.
- "Pronto até: HH:MM" na ordem correta nos dois documentos.
- Mesmo código de pedido nos dois documentos, 80 mm respeitado.
- Nenhuma outra empresa afetada.

## Detalhes técnicos

- Arquivo único: `scripts/auto_printer.py` (`extrair_blocos_v2` e `imprimir_gdi`), isolado pela allowlist `GDI_COMPANY_IDS`.
- Incremento de versão do script e registro em Novidades.
- Após publicar, o usuário baixa o novo `auto_printer.py` e reinicia `iniciar_impressao.cmd` uma vez.
