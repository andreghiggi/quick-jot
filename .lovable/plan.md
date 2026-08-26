# Amore Mio — restaurar fielmente os PDFs no printer

Escopo estrito: somente a impressão local da **Amore Mio** (`f5f9eec3-67bc-497a-88a6-ce41d3b15df8`). Nenhuma outra loja, fila, pedido, TEF, NFC-e ou configuração será alterada.

## Diagnóstico confirmado

- O sistema envia HTML do Layout V2 corretamente, mas o `auto_printer.py` 1.7.1 remove o HTML/CSS e entrega ao GDI apenas texto linear.
- A função `montar_linhas_estilizadas` tenta reconstruir o visual por expressões regulares. Ela não preserva os blocos, alinhamentos, separadores, tamanhos e espaçamentos dos PDFs; no recibo, elementos como `RECIBO`, código e totais nem recebem estilos próprios.
- A fonte base é calculada dividindo a largura imprimível em **44 colunas** no papel de 80 mm. Na POS de 203 DPI isso resulta em corpo próximo de 7–8 pt, menor que o Layout V2 de referência.
- O GDI usa `HORZRES` diretamente. Esse valor representa a página configurada no driver — no Microsoft Print to PDF normalmente A4 — e não a largura de 80 mm definida no ComandaTech. Portanto, o mesmo código escala de forma diferente entre a POS e a impressora PDF.
- Os PDFs anexados têm hierarquia visual própria: cabeçalho e pedido grandes, modalidade destacada, faixa preta do cliente, data/previsão grandes, itens proporcionais e totais destacados. O renderizador atual não contém estrutura suficiente para reproduzi-la.

## Correção em 3 etapas

### 1. Preservar a estrutura do Layout V2
- Substituir, apenas no caminho GDI da Amore Mio, a conversão HTML → texto por um parser semântico HTML → blocos de impressão.
- Reconhecer separadamente **comanda de produção** e **recibo**, preservando título, modalidade, pedido/código, cliente, data, previsão, endereço, itens, adicionais, observações, valores, subtotal, total, pagamento e rodapé.
- Manter os marcadores V2 existentes e impedir que estilos da comanda sejam aplicados indevidamente ao recibo.

### 2. Renderizar com medidas físicas e tipografia fixas
- Construir uma área lógica de exatamente **58 mm ou 80 mm**, conforme `printer_paper_size`, limitada à área imprimível real da impressora.
- Calcular fontes em pontos usando o DPI vertical do driver, em vez de derivá-las de “44 colunas”.
- Reproduzir a hierarquia dos PDFs anexados: tamanhos maiores, pesos corretos, alinhamentos, faixa preta, espaçamento vertical, quebra de linha e separadores.
- No Microsoft Print to PDF, manter o conteúdo na largura térmica configurada mesmo quando o driver estiver em A4; na POS, ocupar corretamente a largura útil sem reduzir a fonte.

### 3. Validar e liberar o novo printer
- Criar testes de parsing e composição usando exemplos equivalentes aos dois PDFs anexados.
- Validar os dois documentos em 80 mm: **1 comanda + 1 recibo**, mesmo código do pedido, sem páginas vazias, duplicidade ou conteúdo cortado.
- Conferir também o dimensionamento em 58 mm para garantir que a configuração do sistema continue sendo respeitada.
- Incrementar a versão do `auto_printer.py`, registrar a correção em Novidades e disponibilizar o arquivo atualizado para substituição na Amore Mio.

## Critérios de aceite

- Comanda e recibo deixam de usar o visual textual simplificado e reproduzem a hierarquia dos PDFs fornecidos.
- Fontes ficam legíveis e proporcionais tanto na POS quanto no Microsoft Print to PDF.
- O papel selecionado no sistema controla a largura do layout; hoje, na Amore Mio, **80 mm**.
- Cada job produz exatamente um documento válido e não vazio.
- Nenhuma outra empresa é afetada.

## Detalhes técnicos

- Arquivo principal: `scripts/auto_printer.py`.
- Isolamento mantido pela allowlist `GDI_COMPANY_IDS` da Amore Mio.
- O ajuste não depende de alterar pedidos existentes, banco de dados ou geradores V2 usados pelas demais lojas.
- A validação final em hardware requer substituir o script local da Amore Mio e reiniciar `iniciar_impressao.cmd` uma única vez.
