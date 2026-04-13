
-- Create resellers table
CREATE TABLE public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all resellers"
  ON public.resellers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_resellers_updated_at
  BEFORE UPDATE ON public.resellers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create reseller_settings table
CREATE TABLE public.reseller_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE UNIQUE,
  activation_fee numeric NOT NULL DEFAULT 180.00,
  monthly_fee numeric NOT NULL DEFAULT 29.90,
  invoice_due_day integer NOT NULL DEFAULT 10,
  asaas_api_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_due_day CHECK (invoice_due_day IN (5, 10, 15, 20, 25))
);

ALTER TABLE public.reseller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all reseller settings"
  ON public.reseller_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_reseller_settings_updated_at
  BEFORE UPDATE ON public.reseller_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add reseller_id to companies
ALTER TABLE public.companies ADD COLUMN reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL;

-- Create reseller_companies relationship table
CREATE TABLE public.reseller_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, company_id)
);

ALTER TABLE public.reseller_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all reseller companies"
  ON public.reseller_companies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
