
ALTER TABLE public.accounts_receivable_payments
  ADD COLUMN IF NOT EXISTS cash_register_id uuid REFERENCES public.cash_registers(id);

CREATE INDEX IF NOT EXISTS idx_arp_cash_register
  ON public.accounts_receivable_payments (company_id, cash_register_id)
  WHERE reversed_at IS NULL;
