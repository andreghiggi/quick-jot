CREATE TABLE public.pdv_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  promo_message text NOT NULL DEFAULT '',
  print_show_customer boolean NOT NULL DEFAULT true,
  print_show_discount boolean NOT NULL DEFAULT true,
  print_show_surcharge boolean NOT NULL DEFAULT true,
  print_show_serial boolean NOT NULL DEFAULT false,
  print_show_sale_notes boolean NOT NULL DEFAULT true,
  print_show_product_notes boolean NOT NULL DEFAULT true,
  require_customer_above_value numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_settings TO authenticated;
GRANT ALL ON public.pdv_settings TO service_role;

ALTER TABLE public.pdv_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view their pdv_settings"
  ON public.pdv_settings FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company users can insert their pdv_settings"
  ON public.pdv_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company users can update their pdv_settings"
  ON public.pdv_settings FOR UPDATE
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER update_pdv_settings_updated_at
  BEFORE UPDATE ON public.pdv_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();