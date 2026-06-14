CREATE TABLE public.pdv_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pdv_sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_method_name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  integration text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_sale_payments_sale ON public.pdv_sale_payments(sale_id);
CREATE INDEX idx_pdv_sale_payments_company ON public.pdv_sale_payments(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_sale_payments TO authenticated;
GRANT ALL ON public.pdv_sale_payments TO service_role;

ALTER TABLE public.pdv_sale_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see splits of their company"
  ON public.pdv_sale_payments FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users insert splits in their company"
  ON public.pdv_sale_payments FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users update splits of their company"
  ON public.pdv_sale_payments FOR UPDATE
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users delete splits of their company"
  ON public.pdv_sale_payments FOR DELETE
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));