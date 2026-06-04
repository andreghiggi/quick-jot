
CREATE TABLE public.pdv_v2_open_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  cash_register_id uuid NOT NULL,
  context text NOT NULL,
  context_ref jsonb NOT NULL,
  total numeric NOT NULL,
  paid_amount numeric NOT NULL DEFAULT 0,
  paid_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_v2_open_charges TO authenticated;
GRANT ALL ON public.pdv_v2_open_charges TO service_role;

ALTER TABLE public.pdv_v2_open_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage open charges"
  ON public.pdv_v2_open_charges
  FOR ALL
  TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_pdv_v2_open_charges_cash_status
  ON public.pdv_v2_open_charges (company_id, cash_register_id, status);

CREATE TRIGGER update_pdv_v2_open_charges_updated_at
  BEFORE UPDATE ON public.pdv_v2_open_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
