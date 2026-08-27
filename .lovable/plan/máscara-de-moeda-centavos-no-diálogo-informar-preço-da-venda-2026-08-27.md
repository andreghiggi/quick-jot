# Máscara de moeda (centavos) no diálogo "Informar preço" da Venda Rápida

## Objetivo
No diálogo **"Informar preço"** da Venda Rápida (PDV V2), o campo de valor passa a funcionar como máscara de moeda em centavos: o operador digita apenas números e o valor se desloca automaticamente.

- Digitar `1` → R$ 0,01
- Digitar `135` → R$ 1,35
- Digitar `1180` → R$ 11,80

Sem necessidade de digitar vírgula ou ponto.

## Mudanças

### `src/components/pdv-v2/PDVV2FastCheckout.tsx` (único arquivo alterado)
1. **Input com máscara**: o `onChange` do campo passa a aplicar `maskCurrencyInput()` (função já existente em `src/components/pdv-v2/_format.ts`), que trata a entrada como centavos e exibe sempre formatado (`R$ 1,35`). `inputMode` muda para `numeric`.
2. **Confirmação**: `confirmManualPrice()` passa a usar `parseCurrencyInput()` (também já existente) em vez de `parseFloat` com replace de vírgula — o valor confirmado é idêntico ao exibido na tela.
3. Mantidos: autofocus no campo, Enter confirma, validação de valor > 0, e o fluxo atual (adiciona ao carrinho e segue para cobrança).

## Fora de escopo
- Nenhuma outra tela, loja ou diálogo de preço é alterada.
- Nenhuma mudança de banco de dados ou impressão.

## Validação
- Build OK.
- Teste manual na Venda Rápida: digitar 135 exibe R$ 1,35 e o item entra no carrinho com R$ 1,35; digitar 1180 exibe R$ 11,80.
