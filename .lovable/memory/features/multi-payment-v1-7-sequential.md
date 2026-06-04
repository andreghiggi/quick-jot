---
name: Multi-Payment v1.7 Sequential (beta)
description: PDVV2SequentialPaymentDialog substitui o v1.6 em PDV V2, OrderCardChargeDialog e Pedido Express. Cobrança uma forma por vez com seletor de modalidade TEF, modal travado, retomada via pdv_v2_open_charges. Todas as lojas com PDV V2.
type: feature
---

# Multi-Payment v1.7 (sequential, beta)

- Novo: src/components/pdv-v2/PDVV2SequentialPaymentDialog.tsx (drop-in do v1.6).
- pdvV2MultiPayment.ts: campo aditivo MultiPaymentInputLine._resolved faz runMultiPayment virar passthrough; rollbackApprovedTef exportado.
- Tabela pdv_v2_open_charges (status open/completed/canceled, paid_lines jsonb, context_ref jsonb).
- Trava: sem X/ESC/clicar fora enquanto restante>0. Recusa NÃO faz rollback automático.
- Hidratação: company_id + cash_register_id + status='open' + context_ref->>context_key.
- contextKey: tab:{id} (PDV V2), order:{id} (OrderCardChargeDialog). Pedido Express sem contextKey (efêmero).
- Intocados: runTefPayment, pinpadService, tef-webservice, nfce-proxy, PDVV2PaymentDialog single, splits I9, TEF v1.0/1.1/1.2-beta.
- Bump: v1.12.0-beta.

## v1.7.1 (2026-06-04)

- Adicionado seletor "Só Venda / Venda com NFC-e" no PDVV2SequentialPaymentDialog (default sale_only), visível apenas quando `fiscalEnabled && !hasTefApproved`.
- Quando há linha TEF aprovada, NFC-e é forçada automaticamente (mostra banner; sem escolha).
- `onConfirm` agora é `(lines, { wantsNfce }) => Promise<void>`. Os 3 callers (PDVV2, OrderCardChargeDialog, PedidoExpressDialog) trocaram `if (fiscalEnabled)` por `if (opts.wantsNfce)` na emissão NFC-e.
- Nova prop `fiscalEnabled` repassada pelos 3 callers.
- Bump: v1.12.1-beta.
