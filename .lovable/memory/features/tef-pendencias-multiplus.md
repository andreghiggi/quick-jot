---
name: TEF Pendências Multiplus (Homologação)
description: Lista de pendências reportadas pela Multiplus na homologação TEF v1.0/v1.1 — corrigir tudo junto quando o usuário autorizar
type: feature
---

Pendências identificadas pela Multiplus a corrigir em lote (aguardando autorização explícita do usuário antes de mexer — TEF está congelado).

## 1. CNF enviado após erro no CNC (cancelamento)
Quando o CNC (cancelamento) retorna com erro (ex.: código 86 "SIGA INSTRUÇÕES NO TELEFONE"), o sistema está enviando CNF (confirmação) em seguida. Comportamento correto: se o CNC falhou, NÃO deve haver CNF — a operação não foi concluída.

Logs de exemplo (Intpos.001):
- CNC enviado → resp 030-000 = 86 (erro), 031-000 = v1.456.546
- Em seguida CNF foi enviado indevidamente (000-000 = CNF, 010-000 = CIELO, 012-000 = 413461)

Arquivo provavelmente afetado: `supabase/functions/tef-webservice/index.ts` e/ou `src/services/pinpadService.ts` (fluxo de cancelPinpadTransaction → confirmPinpadTransaction).

## (aguardando demais pendências do usuário)

## 2. Campo 023-000 no CNC deve ecoar o 023-000 da venda original
No CNC (cancelamento), o campo 023-000 (IDENTIFICAÇÃO — número de controle da solicitação, numérico até 10 bytes) deve ser enviado **exatamente igual** ao 023-000 retornado no arquivo de resposta da venda original. Hoje provavelmente está sendo gerado um novo número, o que invalida o cancelamento.

Arquivo provavelmente afetado: `supabase/functions/tef-webservice/index.ts` (montagem do CNC) — precisa persistir o 023-000 da resposta da venda e reusar no cancelamento.

## 3. Header ATV com identificador inválido (não-numérico)
No envio do header ATV (ativação), o campo identificador está sendo enviado com valor incorreto contendo sufixo não-numérico. Exemplo dos logs: `13154648979-ATV` (sufixo "-ATV"). O campo deve ser **somente numérico** (até 10 bytes, mesmo formato do 023-000).

Logs (Intpos.001):
- 023-000 = 17772520718-ATV ❌ (deveria ser apenas 1777252071 ou similar, só dígitos)

Arquivo provavelmente afetado: `supabase/functions/tef-webservice/index.ts` (montagem do request ATV — remover sufixo "-ATV" do identificador, manter só dígitos).

## 4. Campo 800-003 não deve ser enviado em débito à vista
Em vendas de **débito à vista**, o campo 800-003 está sendo enviado indevidamente. Esse campo é **exclusivo para parcelamento** (crédito parcelado) e não deve aparecer no CRT de débito ou crédito à vista.

Logs (Intpos.001 — venda débito à vista):
- 000-000 = CRT
- 001-000 = 1777252807185
- 003-000 = 2200
- 800-001 = 1
- 800-002 = 0
- 800-003 = 0 ❌ (não deveria estar presente)
- 800-005 = 60177876000130
- 800-006 = 1

Arquivo provavelmente afetado: `supabase/functions/tef-webservice/index.ts` (montagem do CRT — só incluir 800-003 quando `paymentType === 'credit' && installments > 1`).
