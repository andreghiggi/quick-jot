
-- Create tax_rules table for Simples Nacional fiscal rules
CREATE TABLE public.tax_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cfop TEXT NOT NULL,
  ncm TEXT NOT NULL,
  csosn TEXT NOT NULL,
  icms_origin TEXT NOT NULL DEFAULT '0',
  icms_aliquot NUMERIC NOT NULL DEFAULT 0,
  pis_cst TEXT NOT NULL DEFAULT '49',
  pis_aliquot NUMERIC NOT NULL DEFAULT 0,
  cofins_cst TEXT NOT NULL DEFAULT '49',
  cofins_aliquot NUMERIC NOT NULL DEFAULT 0,
  ipi_cst TEXT NOT NULL DEFAULT '99',
  ipi_aliquot NUMERIC NOT NULL DEFAULT 0,
  cest TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add tax_rule_id to products
ALTER TABLE public.products ADD COLUMN tax_rule_id UUID REFERENCES public.tax_rules(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tax rules managed by company users"
ON public.tax_rules FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_tax_rules_updated_at
BEFORE UPDATE ON public.tax_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add unique constraint on name per company
CREATE UNIQUE INDEX idx_tax_rules_name_company ON public.tax_rules(name, company_id);
