---
name: Frente de Caixa (mercado)
description: Tela /frente-caixa para mini mercados — bipe de código de barras, atalhos F2/F4/Esc, reusa PDVV2PaymentDialog e useCashRegister.addSale. Sem TEF nem NFC-e nesta versão.
type: feature
---
- Rota: `/frente-caixa` em `src/pages/FrenteCaixa.tsx`, dentro do `PDVV2Layout`.
- Gating: `useMercadoEnabled(company.id)`. Se desativado → `<Navigate to="/pdv-v2" replace />`.
- Sidebar (`PDVV2Sidebar.tsx`): item "Frente de Caixa" só aparece quando `isModuleEnabled('mercado')`.
- Operação: input sempre focado (polling 800ms refoca quando algo perde foco), Enter dispara busca (GTIN exato → SKU exato → nome parcial), padrão `N*CODIGO` multiplica qty.
- Atalhos globais: F2 finaliza, F4 remove último item, Esc abre confirmação de cancelamento.
- Finalização: reusa `PDVV2PaymentDialog` (channel='pdv'). Se método selecionado for TEF (`tef_pinpad`/`tef_smartpos`), aborta com toast — TEF na Frente de Caixa fica para fase seguinte.
- Persistência: `useCashRegister.addSale(items, paymentMethodId, userId, discount, undefined, notes)`. Sem `order_id`. Não envolve `orders`, NFC-e nem impressão (fase 4 MVP).
- Bloqueio: se `cashOpenKnown === false`, mostra banner "Abra um caixa…" e desabilita input/Finalizar.
- Feedback sonoro: Web Audio API inline (880Hz sucesso, 220Hz erro).
- NÃO altera: PDV V2 (dashboard, OrderCardChargeDialog, Finalizar Venda), Pedido Express, TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento v1.6, NFC-e, impressão.
- Versão introduzida: 1.9.0-beta.
