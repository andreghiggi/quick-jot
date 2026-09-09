# Corrigir a instalação da impressão (Rei do Açaí)

## O que está acontecendo

A tela do instalador mostra dois problemas ao mesmo tempo:

1. **Linhas quebradas** (`'lor' não é reconhecido`, `'cho.'`, `'ho'`): os arquivos `.bat`/`.cmd` são baixados do painel com quebra de linha do Linux. O Windows lê os comandos pela metade — `color` vira `lor`, `echo.` vira `cho.`. Por isso a janela abre cheia de erros logo no começo.
2. **`ERRO: company_id nao fornecido`**: o arquivo de impressão foi baixado pelo botão que entrega o modelo "cru", sem a identificação da loja dentro, e o arquivo de iniciar chama o programa sem informar a loja. Resultado: o programa não sabe de qual loja imprimir e encerra.

Nada disso afeta pedidos, produtos ou outras lojas — é só a geração dos arquivos que o lojista baixa.

## O que vai ser ajustado

- Todo arquivo `.bat`, `.cmd` e `.txt` baixado do painel passa a sair com quebra de linha do Windows, para o Windows executar linha por linha corretamente.
- O botão que hoje entrega o arquivo de impressão sem identificação passa a entregar sempre a versão já personalizada com a loja (mesma versão do botão principal).
- O arquivo de iniciar baixado passa a ser gerado com o nome e a identificação da loja embutidos, em vez de um arquivo genérico.
- O programa de impressão passa a procurar a identificação da loja também num arquivo `company_id.txt` gravado na pasta, e, se ainda assim não achar, mostra uma mensagem clara mandando baixar de novo pelo painel em vez do texto atual.

## Detalhes técnicos

- `src/pages/Settings.tsx`
  - `downloadTextFile`: normalizar conteúdo para CRLF quando a extensão for `.bat`, `.cmd` ou `.txt`.
  - `handleDownloadScript` já usa `generatePythonScript()`; trocar o botão da linha ~1615 (`downloadTextFile(autoPrinterTemplate, ...)`) para o mesmo handler.
  - `handleDownloadIniciar`: usar `generateBatScript()` (que já injeta `--company_id`/`--company_name`) e salvar como `iniciar_impressao.cmd`; gravar também `company_id.txt` junto do download do script.
- `scripts/auto_printer.py`
  - No bloco `__main__`, ordem de resolução: `--company_id` → `COMPANY_ID` injetado → `company_id.txt` na pasta do script → variável de ambiente `COMANDATECH_COMPANY_ID`.
  - Mensagem de erro final: instruir a rebaixar `auto_printer.py` em Configurações → Impressão.
- Sem mudança de banco, de RLS ou de layout de cupom. Sem alterar `scripts/instalar_impressao.cmd` além do necessário.

## Pronto quando

- O lojista baixa os arquivos de novo, executa o instalador e a janela abre sem linhas quebradas.
- O iniciador sobe o serviço imprimindo os pedidos da loja, sem a mensagem de identificação faltando.
