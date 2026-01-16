
-- Tabela de módulos habilitados por empresa
CREATE TABLE public.company_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, module_name)
);

-- Tabela de formas de pagamento
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de caixas (sessões)
CREATE TABLE public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  closed_by uuid,
  opening_amount numeric NOT NULL DEFAULT 0,
  closing_amount numeric,
  expected_amount numeric,
  difference numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de vendas do PDV
CREATE TABLE public.pdv_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cash_register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id),
  total numeric NOT NULL DEFAULT 0,
  discount numeric DEFAULT 0,
  final_total numeric NOT NULL DEFAULT 0,
  customer_name text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Tabela de itens das vendas
CREATE TABLE public.pdv_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pdv_sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS para company_modules
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all modules"
ON public.company_modules FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company users can view own modules"
ON public.company_modules FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS para payment_methods
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage payment methods"
ON public.payment_methods FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'));

-- RLS para cash_registers
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage cash registers"
ON public.cash_registers FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'));

-- RLS para pdv_sales
ALTER TABLE public.pdv_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage pdv sales"
ON public.pdv_sales FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'));

-- RLS para pdv_sale_items
ALTER TABLE public.pdv_sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage pdv sale items"
ON public.pdv_sale_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pdv_sales s 
    WHERE s.id = sale_id 
    AND (user_belongs_to_company(auth.uid(), s.company_id) OR has_role(auth.uid(), 'super_admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pdv_sales s 
    WHERE s.id = sale_id 
    AND (user_belongs_to_company(auth.uid(), s.company_id) OR has_role(auth.uid(), 'super_admin'))
  )
);

-- Triggers para updated_at
CREATE TRIGGER update_company_modules_updated_at
BEFORE UPDATE ON public.company_modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cash_registers_updated_at
BEFORE UPDATE ON public.cash_registers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
