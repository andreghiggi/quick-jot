
-- 1. Drop old unique constraint
ALTER TABLE public.reseller_invoices 
  DROP CONSTRAINT IF EXISTS reseller_invoices_reseller_id_month_key;

-- 2. Add company_id column (nullable initially for migration)
ALTER TABLE public.reseller_invoices 
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reseller_invoices_company_month 
  ON public.reseller_invoices(company_id, month);

CREATE INDEX IF NOT EXISTS idx_reseller_invoices_status_due 
  ON public.reseller_invoices(status, due_date);

-- 3. Migrate existing aggregated invoices
DO $$
DECLARE
  inv RECORD;
  item RECORD;
  new_inv_id uuid;
BEGIN
  FOR inv IN 
    SELECT * FROM public.reseller_invoices WHERE company_id IS NULL
  LOOP
    FOR item IN 
      SELECT * FROM public.reseller_invoice_items WHERE invoice_id = inv.id
    LOOP
      INSERT INTO public.reseller_invoices (
        reseller_id, company_id, month, due_date, total_value, status, paid_at, payment_method, created_at
      ) VALUES (
        inv.reseller_id, item.company_id, inv.month, inv.due_date, item.value, inv.status, inv.paid_at, inv.payment_method, inv.created_at
      ) RETURNING id INTO new_inv_id;
      
      UPDATE public.reseller_invoice_items 
        SET invoice_id = new_inv_id 
        WHERE id = item.id;
    END LOOP;
    
    DELETE FROM public.reseller_invoices WHERE id = inv.id;
  END LOOP;
END $$;

-- 4. Now require company_id and add new unique constraint
ALTER TABLE public.reseller_invoices 
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.reseller_invoices
  ADD CONSTRAINT reseller_invoices_company_month_key UNIQUE (company_id, month);

-- 5. Function: check if company is blocked due to overdue invoice (3+ days)
CREATE OR REPLACE FUNCTION public.is_company_suspended(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reseller_invoices
    WHERE company_id = _company_id
      AND status IN ('pending', 'overdue')
      AND due_date < (CURRENT_DATE - INTERVAL '3 days')
  )
$$;

-- 6. Function: process overdue invoices, suspend & reactivate companies
CREATE OR REPLACE FUNCTION public.process_overdue_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marked_overdue int := 0;
  suspended_count int := 0;
  reactivated_count int := 0;
BEGIN
  UPDATE public.reseller_invoices
    SET status = 'overdue'
    WHERE status = 'pending'
      AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS marked_overdue = ROW_COUNT;
  
  UPDATE public.companies c
    SET active = false
    WHERE active = true
      AND reseller_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.reseller_invoices i
        WHERE i.company_id = c.id
          AND i.status = 'overdue'
          AND i.due_date < (CURRENT_DATE - INTERVAL '3 days')
      );
  GET DIAGNOSTICS suspended_count = ROW_COUNT;
  
  UPDATE public.companies c
    SET active = true
    WHERE active = false
      AND reseller_id IS NOT NULL
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
$$;
