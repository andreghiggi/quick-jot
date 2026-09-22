# Rei do Açaí: recibo no layout padrão + pedido cancelado que não some da tela

## 1) Impressão do Rei (comparando a foto com o modelo)

O que saiu certo com a v1.7.9: número do pedido grande, faixa preta do cliente e papel na largura certa.

O que ainda está errado, e o motivo:

| Problema na foto | Motivo |
|---|---|
| "AÇAɿ", "REI DO AÇAɿ" (acentos trocados) | o programa manda o texto numa tabela de caracteres e a impressora está lendo em outra; falta avisar a impressora qual tabela usar |
| "?" antes de "PEDIDO EXPRESS" e de "RETIRADA NO LOCAL" | são ícones (raio, sacola) que a impressora térmica não tem; hoje viram "?" |
| Itens, adicionais e títulos de grupo sem negrito | essas linhas caem na categoria "texto comum", que sai sem nenhum destaque |
| Sem linhas tracejadas separando os blocos | as linhas de separação estão sendo apagadas na hora de montar o recibo |
| Cabeçalho sem a moldura e sem o nome da loja em negrito | a moldura é desenhada só no "modo gráfico"; no modo da impressora ela precisa ser recriada com tracejado e negrito |

### O que será feito no programa de impressão (v1.8.0)

1. Avisar a impressora, no começo de cada impressão, qual tabela de caracteres usar, para os acentos saírem corretos (com troca automática se a impressora não aceitar).
2. Trocar ícones por texto simples (ex.: raio → "EXPRESS", sacola → "RETIRADA"), acabando com os "?".
3. Dar negrito aos itens, aos adicionais ("+ ...") e aos títulos de grupo ("Escolha a base:", "Adicionais Premium:"), com o marcador quadrado do modelo.
4. Restaurar as linhas tracejadas entre cabeçalho, cliente, itens e totais.
5. Cabeçalho no formato do modelo: nome da loja em negrito, número do pedido grande, modalidade em faixa invertida, e tracejado fechando o bloco.
6. Manter tudo isso apenas no caminho usado pelo Rei; nada muda para as outras lojas.

Depois disso o Rei precisa **baixar o programa novo (v1.8.0)** e reiniciar o programinha. O conserto do módulo gráfico do Windows (pywin32) continua opcional — com ele o recibo fica ainda mais próximo do modelo.

## 2) Pedido cancelado que continua na tela

Duas causas, as duas serão tratadas:

1. A correção da atualização automática (v1.74.1-beta) **ainda não foi publicada** — o Rei está rodando a versão anterior, sem renovação da conexão de tempo real. Vamos publicar.
2. Mesmo com o tempo real, cancelar não mexe na lista local: a tela espera o aviso do banco. Vamos fazer o cancelamento sumir na hora, igual já acontece ao excluir um pedido (atualização imediata na tela + sincronização com o banco em seguida).

## Detalhes técnicos

- `scripts/auto_printer.py` (e cópia em `public/auto_printer.py`): `SCRIPT_VERSION = "1.8.0"`.
  - `montar_escpos`: emitir `ESC t` (CP850 = 2, fallback WPC1252 = 16) logo após `ESC @`; sanitizar emojis/glifos fora da tabela antes do `_escpos_encode`.
  - `montar_linhas_estilizadas`: novos estilos `sep` (linha tracejada, hoje descartada na checagem `set(linha) <= {"=","-",".","_"}`), `grupo` (linha terminada em `:` → negrito + `■`) e `loja` (primeira linha → negrito); classificar linhas iniciadas em `+` como `add`.
  - `montar_escpos`: mapear os novos estilos (negrito/underline/centralizado) e desenhar o tracejado com `-` na largura de colunas.
- `src/components/OrderCard.tsx` → `handleCancelOrder`: após o update bem-sucedido, atualizar o estado local via contexto de pedidos (novo `applyLocalOrderStatus`/reuso de `updateOrderStatus` sem segunda escrita) para o card sair da lista na hora.
- Publicar 1.74.1-beta + estas correções na VPS (`VITE_SUPABASE_URL=https://api.comandatech.com.br`), com nova versão em `src/version.ts` e entrada em `src/pages/Changelog.tsx`.
- Sem tocar em banco, migrações, NFC-e, TEF/PinPad ou caixa.

## Validação

- Pedido de teste no Rei com a v1.8.0: conferir acentos, negrito, tracejados e ausência de "?".
- Cancelar um pedido no Rei e confirmar que o card some sem recarregar a página.
