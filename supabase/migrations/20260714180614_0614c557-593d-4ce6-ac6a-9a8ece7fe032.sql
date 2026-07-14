UPDATE public.nfce_records
SET contingencia_offline = false,
    contingencia_efetivada = false
WHERE company_id = '55181771-8b10-4af1-afc3-472c090a49be'
  AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND status = 'autorizada'
  AND (response_payload::text ~ '<tpEmis>\s*1\s*</tpEmis>');