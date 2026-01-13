-- Create customers table to store customer data for auto-fill
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, phone)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Customers can be created/read publicly (for menu orders)
CREATE POLICY "Customers can be read publicly" 
ON public.customers 
FOR SELECT 
USING (true);

CREATE POLICY "Customers can be created publicly" 
ON public.customers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Customers can be updated publicly" 
ON public.customers 
FOR UPDATE 
USING (true);

-- Company users can manage their customers
CREATE POLICY "Company users can manage customers" 
ON public.customers 
FOR ALL 
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'));

-- Trigger to update updated_at
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();