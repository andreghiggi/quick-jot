CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_company
ON public.cash_registers (company_id)
WHERE status = 'open';