CREATE TABLE public.pdv_sale_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pdv_sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by_name text,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  tef_reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdv_sale_cancellations_sale ON public.pdv_sale_cancellations(sale_id);
CREATE INDEX idx_pdv_sale_cancellations_company_date ON public.pdv_sale_cancellations(company_id, cancelled_at DESC);

GRANT SELECT, INSERT ON public.pdv_sale_cancellations TO authenticated;
GRANT ALL ON public.pdv_sale_cancellations TO service_role;

ALTER TABLE public.pdv_sale_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view sale cancellations"
  ON public.pdv_sale_cancellations FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company members can insert sale cancellations"
  ON public.pdv_sale_cancellations FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));