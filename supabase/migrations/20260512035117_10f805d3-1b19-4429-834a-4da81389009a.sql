ALTER TABLE public.waiters ADD COLUMN IF NOT EXISTS cpf text;
CREATE UNIQUE INDEX IF NOT EXISTS waiters_company_cpf_unique
  ON public.waiters(company_id, cpf)
  WHERE cpf IS NOT NULL;