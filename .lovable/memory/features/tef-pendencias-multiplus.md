---
name: TEF Pendências Multiplus (Homologação)
description: Pendências da homologação TEF Multiplus — TODAS CORRIGIDAS na v1.2 (aguardando re-validação)
type: feature
---

Pendências identificadas pela Multiplus na homologação. **Status: TODAS APLICADAS** em `supabase/functions/tef-webservice/index.ts`, `src/utils/tefOrderActions.ts`, `src/services/pinpadService.ts` e nos 3 callers de venda PinPad (PDV, PDV V2, Pedido Express). Aguardando re-teste da Multiplus.

## 1. CNF enviado após erro no CNC (cancelamento) — ✅ CORRIGIDO
Quando o CNC (cancelamento) retorna com erro (ex.: código 86 "SIGA INSTRUÇÕES NO TELEFONE"), o sistema está enviando CNF (confirmação) em seguida. Comportamento correto: se o CNC falhou, NÃO deve haver CNF — a operação não foi concluída.
Fix: em `src/utils/tefOrderActions.ts` o CNF agora só é disparado quando `status.status === 'approved'`. Declined/cancelled/error não enviam CNF.

## 2. Campo 023-000 no CNC deve ecoar o 023-000 da venda original — ✅ CORRIGIDO
No CNC (cancelamento), o campo 023-000 (IDENTIFICAÇÃO — número de controle da solicitação, numérico até 10 bytes) deve ser enviado **exatamente igual** ao 023-000 retornado no arquivo de resposta da venda original. Hoje provavelmente está sendo gerado um novo número, o que invalida o cancelamento.
Fix: edge function expõe `controlNumber` (parsed['023-000']) no `get-status`; pinpadService propaga; os 3 callers (pdvV2Tef, PDV, PedidoExpressDialog) persistem nas notes como `[TEF023]xxx[/TEF023]`; `parseTefDataFromNotes` extrai e `estornarTefPedido` envia esse valor no parâmetro `horaTransacao` (nome legado), que o edge sanitiza para dígitos no campo 023-000 do CNC. Vendas antigas sem a tag mantêm fallback HHmmss.

### Re-validação Multiplus (CNC crédito à vista) — fallback HHmmss removido
Multiplus reportou que CNC de crédito à vista enviou `023-000=193856` quando o correto era `193852` (delta de 4s — janela entre autorização e gravação no banco). Causa: fallback `format(saleDate, 'HHmmss')` em `estornarTefPedido` quando a venda não tinha `[TEF023]` persistido. Fix v2: removido o fallback; se `controlNumber` ausente, retorna erro pedindo cancelamento manual no gerenciador. Também removido fallback `result.controlNumber || result.transactionTime` em `pinpadService.ts`.

## 3. Header ATV com identificador inválido (não-numérico) — ✅ CORRIGIDO
No envio do header ATV (ativação), o campo identificador está sendo enviado com valor incorreto contendo sufixo não-numérico. Exemplo dos logs: `13154648979-ATV` (sufixo "-ATV"). O campo deve ser **somente numérico** (até 10 bytes, mesmo formato do 023-000).
Fix: ATV pré-CRT (Lancheria I9) agora usa `String(ident).replace(/\D/g,'').slice(-10)` no 001-000.

## 4. Campo 800-003 não deve ser enviado em débito à vista — ✅ CORRIGIDO
Em vendas de **débito à vista**, o campo 800-003 está sendo enviado indevidamente. Esse campo é **exclusivo para parcelamento** (crédito parcelado) e não deve aparecer no CRT de débito ou crédito à vista.
Fix: removido o bloco I9 que injetava `800-003=0` em débito à vista. Agora 800-003 só sai quando `installments > 1`.

## 5. Campo 003-000 (VALOR TOTAL) — duas casas decimais SEM vírgula — ✅ JÁ ESTAVA OK
Regra confirmada pela Multiplus: o campo 003-000 (Valor Total) é **numérico até 12 bytes, com duas casas decimais sem a vírgula separadora**.
Código já usa `String(Math.round(amount * 100))` em CRT e CNC — gera inteiro de centavos sem separador. Comentários explicativos adicionados nos dois pontos.
