---
name: Frente de Caixa (mercado)
description: Tela /frente-caixa para mini mercados — bipe de código de barras, atalhos F2/F4/Esc, reusa PDVV2PaymentDialog e useCashRegister.addSale. Sem TEF nem NFC-e nesta versão.
type: feature
---
- Rota: `/frente-caixa` em `src/pages/FrenteCaixa.tsx`, dentro do `PDVV2Layout`.
- Gating: `useMercadoEnabled(company.id)`. Se desativado → `<Navigate to="/pdv-v2" replace />`.
- Sidebar (`PDVV2Sidebar.tsx`): item "Frente de Caixa" só aparece quando `isModuleEnabled('mercado')`.
- Operação: input sempre focado (polling 800ms refoca quando algo perde foco), Enter dispara busca (GTIN exato → SKU exato → nome parcial), padrão `N*CODIGO` multiplica qty.
- Cancelar unidade (botão X da linha): qty=1 remove direto; qty>1 abre AlertDialog "Cancelar quantas unidades?" com Input numérico e botões "1" / "Todas".
- Atalhos globais: F2 finaliza, F4 remove último item, Esc abre confirmação de cancelamento.
- Finalização (v1.17+): `FrenteCaixaCheckoutDialog` (em `src/components/frente-caixa/`) — tela "Finalizando venda" estilo Gweb, multi-pagamento via `runMultiPayment` (v1.6), atalhos A–Z para foco, Ctrl+1/2/3 para etapas, Home p/ desconto/acréscimo. SALVAR só com Falta = 0. TEF integrado (PinPad).
- Ajustes por item (v1.18+): clique direito na linha abre menu de contexto com "Alterar preço" (Home) e "Editar detalhes" (Ctrl+D). Atalhos atuam sobre `lastTouchedId`.
  - `FrenteCaixaPriceDialog` — 3 modos (Desconto −, Alteração no valor =, Acréscimo +). Cada aplicação SOMA em `line_discount`/`line_surcharge` ou sobrescreve `effective_unit_price`.
  - `FrenteCaixaItemDetailsDialog` — aba IDENTIFICAÇÃO apenas (sem ADICIONAIS), edita qty / unit_price / desconto e tem botão REMOVER.
  - `CartLine` ganhou `effective_unit_price`, `line_discount`, `line_surcharge`. Total = Σ(eff × qty − desc + acr). `pdv_sale_items.unit_price` salvo já reflete o valor efetivo da linha. Detalhes vão em `notes` da venda como linhas separadas para auditoria.
- Persistência: `useCashRegister.addSale(items, paymentMethodId, userId, discount, undefined, notes)`. Sem `order_id`. Não envolve `orders`, NFC-e nem impressão (fase 4 MVP).
- Bloqueio: se `cashOpenKnown === false`, mostra banner "Abra um caixa…" e desabilita input/Finalizar.
- Feedback sonoro: Web Audio API inline (880Hz sucesso, 220Hz erro).
- NÃO altera: PDV V2 (dashboard, OrderCardChargeDialog, Finalizar Venda), Pedido Express, TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento v1.6 dos outros canais, NFC-e, impressão.
- NFC-e na Frente de Caixa: planejada para versão futura (não emitida automaticamente em v1.17).
- Versão introduzida: 1.9.0-beta. Tela "Finalizando venda" adicionada em 1.17.0-beta. Menu de contexto + ajustes por item adicionados em 1.18.0-beta.
