# Venda Rápida como venda pura de caixa (Amore Mio)

A Venda Rápida deixa de se comportar como pedido de balcão e passa a ser apenas uma venda registrada no caixa.

## O que muda

1. **Sem pergunta de impressão de recibo**
   Ao confirmar o pagamento, o modal "Imprimir recibo de venda?" não aparece mais. A venda é finalizada direto.
   (Lojas com fiscal ativo que emitem NFC-e continuam com o fluxo fiscal normal — na Amore Mio o fiscal está desligado, então é sempre confirmação direta.)

2. **Sem criação de pedido**
   A Venda Rápida não cria mais registro de pedido (`orders`). Deixa de aparecer na lista de pedidos / cards do PDV.

3. **Sem comanda de produção**
   Nada é enviado para a fila de impressão da cozinha.

4. **Continua funcionando**
   - Venda gravada em `pdv_sales` com a marca `[VENDA RÁPIDA]`, itens em `pdv_sale_items`.
   - Valor entra no caixa na forma de pagamento escolhida (Dinheiro / Crédito / Débito / PIX).
   - Aparece no Relatório de Vendas como Venda Rápida; ao clicar, mostra os itens vendidos.
   - Gaveta de caixa continua abrindo se estiver habilitada.

## Detalhes técnicos

- `src/components/pdv-v2/PDVV2FastCheckout.tsx`
  - Remover a chamada `addOrder(...)` e todo o bloco de impressão que depende dela (`printOnlyReceipt` e `enqueueProductionByStation`).
  - Manter inserts em `pdv_sales` / `pdv_sale_items`, o fluxo TEF, a gaveta e o fluxo NFC-e quando o fiscal estiver ativo.
- `src/components/pdv-v2/PDVV2PaymentDialog.tsx`
  - Suprimir o passo de "Imprimir recibo de venda?" quando o diálogo for aberto pela Venda Rápida (nova prop, ex. `skipReceiptPrompt`), sem alterar o comportamento do PDV V2 e demais fluxos.
- Verificar em `src/pages/SalesReport.tsx` que a venda com nota `[VENDA RÁPIDA]` é listada e o detalhe carrega `pdv_sale_items` (já suportado).
- Bump de versão em `src/version.ts` + entrada no Changelog (Novidades).

Nenhuma outra loja ou fluxo é afetado.
