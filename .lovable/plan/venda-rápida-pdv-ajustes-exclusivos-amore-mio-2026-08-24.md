# Venda Rápida (PDV) — ajustes exclusivos Amore Mio

Dois ajustes na tela de Venda Rápida do PDV V2, aplicados **somente** para a empresa Amore Mio (id `f5f9eec3-...`). Todas as outras lojas continuam exatamente com o comportamento atual.

## 1. Finalização pelo fluxo padrão do PDV

Hoje a Venda Rápida mostra uma lista de botões de forma de pagamento e fecha a venda direto no clique, sem desconto, sem escolha de documento (NFC-e), sem TEF e sem confirmação.

Novo comportamento (Amore Mio):
- Um único botão **"Finalizar venda"** abaixo do total.
- Ao clicar, abre o mesmo diálogo de cobrança usado no restante do PDV (formas de pagamento, desconto, modo de documento/NFC-e, TEF quando a forma for maquininha, impressão).
- Confirmado o pagamento, a venda é registrada como já é hoje: registro no caixa, itens da venda, pedido no histórico e envio da comanda de produção/recibo para impressão — usando a forma de pagamento, o desconto e o total final devolvidos pelo diálogo.
- Se o caixa estiver fechado ou o carrinho vazio, o botão continua bloqueado como hoje.

## 2. Produto sem preço pede o valor na hora

- Ao selecionar na Venda Rápida um produto cadastrado sem preço (valor zerado ou vazio), abre um pequeno diálogo pedindo o **preço de venda** antes de adicionar ao carrinho.
- Campo em reais, com validação: só adiciona com valor maior que zero; cancelar não adiciona o item.
- Para itens de balança (kg), o valor informado é tratado como preço por kg e multiplicado pelo peso lido, mantendo o comportamento atual da balança.
- Produtos com preço cadastrado seguem sendo adicionados direto, sem nenhum passo extra.

## Detalhes técnicos

- Arquivo principal: `src/components/pdv-v2/PDVV2FastCheckout.tsx`.
- Flag local `isAmoreMio = companyId === 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8'` (mesmo padrão já usado em `PDVV2AddItemSearch.tsx` e `printRouting.ts`); quando falso, a UI atual de botões por forma de pagamento e o add direto permanecem intactos.
- Reuso de `PDVV2PaymentDialog` com `showDocumentMode` ligado e `channel="pdv"`; o `onConfirm` chama a função de finalização existente (`handleFinish`) refatorada para receber `paymentMethodId`, `discount` e `finalTotal` em vez de procurar a forma pelo nome.
- Impressão e gaveta continuam pelo caminho atual (`printOnlyReceipt` + `enqueueProductionByStation` + `openCashDrawer`), sem alteração no `auto_printer.py`.
- Novo diálogo de preço: componente local simples dentro do FastCheckout, sem mudanças em cadastro de produto nem no banco.
