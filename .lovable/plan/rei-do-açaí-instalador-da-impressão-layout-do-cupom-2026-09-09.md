# Rei do Açaí — instalador da impressão + layout do cupom

## Problema 1 — a janela abre com erros

A tela mostra duas falhas ao mesmo tempo:

1. **Linhas quebradas** (`'lor' não é reconhecido`, `'cho.'`, `'ho'`): os arquivos de instalação e de iniciar são baixados do painel com quebra de linha do Linux. O Windows lê os comandos pela metade — `color` vira `lor`, `echo.` vira `cho.`.
2. **`ERRO: company_id nao fornecido`**: o arquivo de impressão foi baixado pelo botão que entrega o modelo "cru", sem a identificação da loja dentro, e o arquivo de iniciar chama o programa sem informar a loja.

## Problema 2 — layout do cupom

O modelo enviado (PDF) é o formato com cabeçalho grande da loja, número do pedido, faixa "PEDIDO EXPRESS", data, "Pronto até", cliente, telefone, pagamento, modalidade, itens com preço, subtotal, total e "Obrigado pela preferência!". Esse desenho já existe no programa de impressão (modo gráfico usado hoje pela Amore Mio); o Rei do Açaí ainda imprime no modo antigo, por isso sai diferente.

## O que vai ser feito

- Todo arquivo `.bat`, `.cmd` e `.txt` baixado do painel passa a sair com quebra de linha do Windows.
- O botão que entrega o arquivo de impressão sem identificação passa a entregar sempre a versão personalizada da loja.
- O arquivo de iniciar passa a ser gerado já com o nome e a identificação da loja.
- O programa passa a procurar a identificação também num arquivo `company_id.txt` da pasta e, se faltar, mostra mensagem clara pedindo para baixar de novo pelo painel.
- O Rei do Açaí passa a usar o mesmo desenho de cupom do PDF, isolado só para essa loja. Nenhuma outra loja muda.

## Detalhes técnicos

- `src/pages/Settings.tsx`
  - `downloadTextFile`: normalizar para CRLF quando a extensão for `.bat`, `.cmd` ou `.txt`.
  - Botão da linha ~1615 (`downloadTextFile(autoPrinterTemplate, ...)`) passa a chamar `handleDownloadScript` (usa `generatePythonScript()`, que injeta `COMPANY_ID`, `API_KEY`, `PAPER_SIZE`, `PRINT_LAYOUT`).
  - `handleDownloadIniciar`: usar `generateBatScript()` (já injeta `--company_id`/`--company_name`) e gravar também `company_id.txt`.
- `scripts/auto_printer.py`
  - `__main__`: ordem de resolução `--company_id` → `COMPANY_ID` injetado → `company_id.txt` → env `COMANDATECH_COMPANY_ID`; mensagem de erro orientando rebaixar em Configurações → Impressão.
  - Adicionar `b2f97590-ff21-4951-95dc-e3e2b19d4ccb` (Rei do Açaí) a `GDI_COMPANY_IDS`, que aciona `montar_linhas_estilizadas` + `imprimir_gdi` (cabeçalho, "Pronto até", itens, totais, rodapé "Obrigado pela preferência!").
  - Sem mexer em `SKIP_BACKLOG_COMPANY_IDS`, nem em layout V1/V2 das demais lojas.
- Sem alteração de banco, RLS, fiscal, TEF ou visual do painel.

## Sobre "ficará exatamente igual ao PDF?"

A estrutura, a ordem dos blocos, os destaques em negrito e o rodapé serão os mesmos do PDF, porque o cupom passará a ser gerado pelo mesmo renderizador que produziu esse modelo. O que pode variar levemente é a espessura das letras e a largura, que dependem do papel configurado na loja (58 mm ou 80 mm) e da impressora física. Depois de aplicar, o certo é tirar um cupom de teste no Rei do Açaí e comparar com o PDF.

## Pronto quando

- O instalador abre sem linhas quebradas e o iniciador sobe o serviço sem pedir identificação.
- Um pedido de teste do Rei do Açaí sai no mesmo formato do PDF enviado.
