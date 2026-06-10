
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cash_register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sangria','suprimento')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_register ON public.cash_movements(cash_register_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_company ON public.cash_movements(company_id, created_at DESC);

GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view their company cash movements"
  ON public.cash_movements FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "users can insert cash movements for their company"
  ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND created_by = auth.uid()
  );
