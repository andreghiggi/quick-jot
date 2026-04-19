CREATE OR REPLACE FUNCTION public.process_overdue_invoices()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  marked_overdue int := 0;
  suspended_count int := 0;
  reactivated_count int := 0;
BEGIN
  -- 1. Marcar faturas vencidas
  UPDATE public.reseller_invoices
    SET status = 'overdue'
    WHERE status = 'pending'
      AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS marked_overdue = ROW_COUNT;

  -- 2. Suspender lojas com fatura vencida há +3 dias
  -- (apenas lojas que NÃO foram bloqueadas/canceladas manualmente)
  UPDATE public.companies c
    SET active = false
    WHERE active = true
      AND reseller_id IS NOT NULL
      AND license_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.reseller_invoices i
        WHERE i.company_id = c.id
          AND i.status IN ('pending', 'overdue')
          AND i.due_date < (CURRENT_DATE - INTERVAL '3 days')
      );
  GET DIAGNOSTICS suspended_count = ROW_COUNT;

  -- 3. Reativar lojas que regularizaram (pagaram ou foram bonificadas)
  -- Só reativa se a licença NÃO estiver bloqueada/cancelada manualmente
  UPDATE public.companies c
    SET active = true
    WHERE active = false
      AND reseller_id IS NOT NULL
      AND license_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.reseller_invoices i
        WHERE i.company_id = c.id
          AND i.status IN ('pending', 'overdue')
          AND i.due_date < (CURRENT_DATE - INTERVAL '3 days')
      );
  GET DIAGNOSTICS reactivated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'marked_overdue', marked_overdue,
    'suspended', suspended_count,
    'reactivated', reactivated_count
  );
END;
$function$;