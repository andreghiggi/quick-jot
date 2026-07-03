---
name: Módulo Financeiro — Fase 1 (Crediário)
description: Módulo opcional 'financeiro' com Contas a Receber alimentado automaticamente pelo Crediário na Frente de Caixa
type: feature
---
Módulo `financeiro` (toggle em CompanyModulesControl). Requer o módulo `mercado`.

Fase 1 (v1.53.0-beta) — Crediário:
- Coluna `pdv_settings.credit_sale_enabled` (default false). Aparece o toggle "Aceitar crediário no checkout" em Frente de Caixa → Configurações, mas SÓ quando o módulo `financeiro` está ativo.
- Tabelas: `accounts_receivable` + `accounts_receivable_payments` (RLS via user_belongs_to_company).
- Diálogo `FrenteCaixaCheckoutDialog` recebe prop `creditSaleAvailable`. Quando true e usuário clica em "Usar crediário": bypass do runMultiPayment, força `fiscalMode='nao_fiscal'`, exige customerName+customerPhone.
- `paymentMethodId` no result vem como sentinela `'__credit_sale__'`. `FrenteCaixa.tsx` detecta e chama `addSale(..., null, ...)` (payment_method_id null em pdv_sales) + `useAccountsReceivable.create()` para gerar o título.
- Tela `/financeiro/contas-a-receber` com Receber (baixa parcial/total + forma de recebimento) e Cancelar.
- Sidebar: item "Contas a Receber" adicionado a `financeMenuItems` quando `financeiroEnabled`. Guard: `FinanceiroGuard` em App.tsx.
- Piloto: manter desligado por padrão; ativar primeiro na Lancheria da I9.

Fora do escopo desta fase: Contas a Pagar, Fluxo de Caixa consolidado, limite de crédito, juros/multa, parcelamento, carnê impresso, extrato do cliente, emissão de NFC-e no ato do crediário.