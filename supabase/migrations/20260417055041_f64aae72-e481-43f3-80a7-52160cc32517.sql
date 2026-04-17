-- Adiciona campos de controle de licença na tabela companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS license_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS license_block_reason text,
  ADD COLUMN IF NOT EXISTS license_block_message text,
  ADD COLUMN IF NOT EXISTS license_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_blocked_by uuid,
  ADD COLUMN IF NOT EXISTS license_canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_canceled_by uuid,
  ADD COLUMN IF NOT EXISTS next_invoice_due_day int;

-- Constraint de status permitido
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_license_status_check') THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_license_status_check
      CHECK (license_status IN ('active', 'blocked', 'canceled'));
  END IF;
END $$;

-- Atualiza função de suspensão para considerar bloqueio/cancelamento manual da revenda
CREATE OR REPLACE FUNCTION public.is_company_suspended(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND license_status IN ('blocked', 'canceled')
  ) OR EXISTS (
    SELECT 1 FROM public.reseller_invoices
    WHERE company_id = _company_id
      AND status IN ('pending', 'overdue')
      AND due_date < (CURRENT_DATE - INTERVAL '3 days')
  )
$function$;