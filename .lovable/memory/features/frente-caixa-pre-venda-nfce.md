---
name: Frente de Caixa — Pré-venda + NFC-e (Fases 1+2+3)
description: Venda fiscal vs pré-venda no Frente de Caixa, com NFC-e automática no checkout e retroativa na Lista do PDV
type: feature
---

Versão 1.21.0-beta. Espelha o "Defina a ação ao salvar" do Gweb.

## Banco
- `pdv_sales.fiscal_mode` ('fiscal' | 'nao_fiscal', default 'nao_fiscal')
- `pdv_settings.default_fiscal_mode` ('fiscal' | 'nao_fiscal' | 'ask', default 'ask')

## Fluxo
- Config 'Comportamento' → 'Ação ao salvar a venda (fiscal)' define o(s) botão(ões) do checkout:
  - `ask` → 2 botões: "Salvar pré-venda" / "Salvar + NFC-e"
  - `fiscal` → 1 botão "Salvar + NFC-e"
  - `nao_fiscal` → 1 botão "Salvar pré-venda"
- `FrenteCaixaCheckoutResult` ganhou `fiscalMode` e `mpLines`.
- `useCashRegister.addSale(..., fiscalMode?)` grava em `pdv_sales.fiscal_mode`.
- Quando `fiscalMode='fiscal'`, FrenteCaixa.tsx chama `emitirNFCe` com `pagamentos_split = buildPagamentosSplit(mpLines)` (mesma engine do PDV V2 Multi-Pagamento).
- `FrenteCaixaLista` tem botão `FileText` para emissão retroativa em vendas sem NFC-e autorizada — reaproveita `pdv_sale_items`, marca a venda como fiscal e dispara baixa de estoque pendente quando `stock_move_on_fiscal_only` está ligado.

## Garantias de isolamento
- Nada de PDV V2, Pedido Express, OrderCardChargeDialog, TEF v1.x, nfce-proxy ou Multi-Pagamento foi alterado.
- Lojas sem módulo Mercado nunca vêem a tela.
- `applyStockMovementOnce` evita duplicar baixa de estoque ao emitir NFC-e retroativa.