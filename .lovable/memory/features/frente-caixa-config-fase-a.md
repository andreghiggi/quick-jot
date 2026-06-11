---
name: Frente de Caixa — Configurações Fase A
description: Novos toggles em pdv_settings que afetam APENAS a Frente de Caixa (módulo mercado), espelhando o PDV do Gweb.
type: feature
---
Novas colunas em `public.pdv_settings` (todas com default = comportamento atual):
- `cash_control_enabled` (true) — exige caixa aberto para vender.
- `blind_close_enabled` (false) — Rel. de fechamento esconde "Valor esperado" e "Diferença".
- `require_movement_reason` (false) — motivo obrigatório em sangria/suprimento.
- `block_sale_without_price` (true) — bloqueia adicionar produto com preço ≤ 0.
- `allow_price_change_on_sale` (true) — desliga "Alterar preço" e atalho Home.
- `confirm_quantity_above` (10) — confirma multiplicador acima desse valor; 0 = nunca.
- `auto_print_on_finish`, `auto_print_second_copy`, `auto_open_drawer_cash`, `clear_screen_after_sale` — flags de impressão/comportamento, gravadas e prontas para a próxima fase de impressão da Frente de Caixa.
- `print_show_logo`, `print_show_review_qr`, `review_qr_url` — extras de cupom, gravados para uso futuro.

**Escopo:** o hook `usePdvSettings` continua exclusivo da Frente de Caixa. PDV V2, Pedido Express, OrderCardChargeDialog, TEF (v1.0/v1.1/v1.2-beta), Multi-Pagamento e NFC-e NÃO leem `pdv_settings` e não devem passar a ler.

UI: `src/pages/FrenteCaixaConfiguracoes.tsx` (cards: Controle de caixa, Itens de venda, Comportamento, Cupom — extras).
Wiring atual: `src/pages/FrenteCaixa.tsx` (cash_control_enabled, block_sale_without_price, allow_price_change_on_sale, confirm_quantity_above, blind_close_enabled via `printCurrentCashClosing`), `FrenteCaixaCashMovementDialog` (require_movement_reason), `cashClosingPrint` (blindClose).