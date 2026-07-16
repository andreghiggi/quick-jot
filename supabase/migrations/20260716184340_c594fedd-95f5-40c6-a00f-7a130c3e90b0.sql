
ALTER TABLE public.accounts_receivable_payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS tef_control_number text;

CREATE INDEX IF NOT EXISTS idx_arp_active
  ON public.accounts_receivable_payments (company_id, paid_at)
  WHERE reversed_at IS NULL;
