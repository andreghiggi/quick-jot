---
name: Multi-Payment v1.6.1 Beta
description: Botão "Dividir formas" agora vive DENTRO do PDVV2PaymentDialog (link abaixo do seletor) via prop `onSplitPayments`. Disponível em Pedido Express, OrderCardChargeDialog e PDV V2 (Cobrar Comanda/Mesa). Link escondido quando i9Mode='items'|'split' ou activeSplit (TEF v1.1 frozen).
type: feature
---

# Multi-Payment v1.6.1 (beta) — Dividir formas em todos os checkouts

## UX
- Link discreto "Quer dividir em várias formas de pagamento? Clique aqui" dentro do `PDVV2PaymentDialog`, logo abaixo do RadioGroup de forma de pagamento.
- Só aparece quando `onSplitPayments` prop é passada E `i9Mode === ''` E `!activeSplit`.
- Clique fecha o single-payment dialog e abre `PDVV2MultiPaymentDialog`.

## Consumidores wireados
1. **PedidoExpressDialog**: já tinha `handleMultiPaymentSubmit`. Botão antigo do rodapé removido.
2. **OrderCardChargeDialog**: novo `handleMultiPaymentSubmit` — addSale (pendentes) + update orders (paid_amount/payment_status) + NFC-e pagamentos_split.
3. **PDVV2.tsx (Cobrar Comanda/Mesa)**: novo `handleMultiPaymentImportTab` — addSale + NFC-e pagamentos_split + closeTab.

## NÃO alterado (TEF v1.x frozen)
- `confirmImportTab` / `confirmImportTabI9` (split por pessoas/itens) — intactos.
- `runTefPayment`, `pinpadService`, `tef-webservice` — intactos.
- `PDVV2PaymentDialog.handleConfirm` (single-payment) — intacto.
- Fluxo single-payment de cada consumidor — intacto.

## v1.6.2 — Split no fechamento de caixa (1.22.0-beta)
- Nova tabela `pdv_sale_payments` (sale_id, company_id, payment_method_id, payment_method_name, amount, integration).
- Helper `src/utils/recordSalePayments.ts` insere uma linha por forma após `addSale` nos 3 consumidores multi (PedidoExpress, OrderCardChargeDialog, PDV V2 importar/cobrar).
- Helper `src/utils/expandSalesWithSplits.ts` explode cada venda com split em N linhas no relatório.
- `CashReport.tsx` e `printCurrentCashClosing.ts` agora usam o expand → cada forma aparece com valor correto no fechamento.
- Vendas single-payment seguem usando `pdv_sales.payment_method_id` (zero impacto).