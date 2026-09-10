---
name: Colisão de numeração de venda no PDV
description: Causa do "Erro ao registrar venda" — pdv_sale_number_counters atrasado vs índice único (company_id, pv_numero)
type: feature
---

`pdv_sales` tem índice único `pdv_sales_company_pv_numero_uidx (company_id, pv_numero) WHERE pv_numero IS NOT NULL`.
O trigger `assign_pdv_sale_number` usa `pdv_sale_number_counters.next_value`.

Após importações/recuperações de dados (ex.: retorno da VPS em 09/2026), o contador fica ATRÁS do
maior `pv_numero` existente e toda venda nova falha com violação de unicidade → toast "Erro ao registrar venda"
(com TEF já aprovado na maquininha).

Correção: `next_value = max(pv_numero)+1` por empresa. Rotina `public.sync_pdv_sale_counters()`
roda via pg_cron diariamente (job `sync-pdv-sale-counters-daily`, 06:20 UTC / 03:20 BRT).

Sempre rodar essa sincronização depois de qualquer import de `pdv_sales`.
Vendas importadas também podem referenciar `cash_register_id` inexistente (FK entrou por replica) —
conferir e recriar o turno fechado para não sumirem do fechamento.
