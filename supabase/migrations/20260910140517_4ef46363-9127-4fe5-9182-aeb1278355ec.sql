CREATE OR REPLACE FUNCTION public.sync_pdv_sale_counters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fixed int := 0;
BEGIN
  UPDATE public.pdv_sale_number_counters c
     SET next_value = sub.mx + 1,
         updated_at = now()
    FROM (
      SELECT company_id, MAX(pv_numero) AS mx
        FROM public.pdv_sales
       WHERE pv_numero IS NOT NULL
       GROUP BY company_id
    ) sub
   WHERE sub.company_id = c.company_id
     AND c.next_value <= sub.mx;
  GET DIAGNOSTICS fixed = ROW_COUNT;

  RETURN jsonb_build_object('counters_fixed', fixed, 'ran_at', now());
END;
$$;

SELECT cron.schedule(
  'sync-pdv-sale-counters-daily',
  '20 6 * * *',
  $$SELECT public.sync_pdv_sale_counters();$$
);