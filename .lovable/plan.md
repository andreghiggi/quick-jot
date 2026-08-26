# Amore Mio — numeração sequencial diária e recibo sem código hexadecimal

Escopo estrito: apenas a loja Amore Mio (`f5f9eec3-67bc-497a-88a6-ce41d3b15df8`). Nenhuma outra loja muda.

## O que é o número embaixo do B-037

É o `order_code` (identificador hexadecimal de 6 caracteres, ex.: `3853EF`), impresso no recibo V2 logo abaixo do código curto. Ele é apenas um identificador interno e será ocultado na impressão.

## Como funciona a numeração hoje (verificado)

O código curto (`short_code`) vem de um contador por loja e prefixo (`order_short_code_counters`), que **nunca zera**: só volta a 001 depois de 1000 pedidos. Por isso hoje está em B-037 acumulado, e não no sequencial do dia.

Prefixos: `B` balcão, `R` retirada, `D` entrega, `M` mesa.

## Correções

### 1. Reinício diário do contador (todos os prefixos)
- Adicionar controle de data (fuso America/Sao_Paulo) ao contador: quando o último uso for de um dia anterior, o contador volta a 1.
- Vale para todos os prefixos: à meia-noite recomeçam B-001, R-001, D-001, M-001.
- Aplicado somente à Amore Mio; as demais lojas continuam com o contador contínuo atual.
- Zerar o contador atual da Amore Mio para que o próximo pedido de hoje/amanhã já saia como B-001.

### 2. Remover o código hexadecimal do recibo
- No recibo V2, deixar de imprimir a linha do `order_code` para a Amore Mio, mantendo o código curto (`B-001`) em destaque.
- A comanda de produção já não exibe esse número; nada muda nela.

## Detalhes técnicos

- Migration: adicionar coluna de data ao `order_short_code_counters` e ajustar `assign_order_short_code()` para, nas empresas com reinício diário, comparar `(now() at time zone 'America/Sao_Paulo')::date` e reiniciar `next_value` quando a data mudar. Comportamento antigo preservado para as demais lojas.
- Frontend: `src/utils/pdvV2Print.ts` passa a omitir a linha `orderCode` quando a loja for a Amore Mio (guarda por `company_id`, como nos demais ajustes exclusivos).
- Registrar nova versão em `src/version.ts` e em Novidades.

## Validação

- Criar dois pedidos de teste na Amore Mio e conferir sequência (B-001, B-002) e recibo sem o hexadecimal.
- Conferir que outra loja (ex.: Rei do Açaí) continua com a numeração e o recibo inalterados.
