
-- Create table status enum
CREATE TYPE public.table_status AS ENUM ('available', 'occupied', 'reserved');

-- Create tables (mesas) table
CREATE TABLE public.tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status table_status NOT NULL DEFAULT 'available',
  capacity INTEGER DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(company_id, number)
);

-- Create tab/comanda table
CREATE TABLE public.tabs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  tab_number INTEGER NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL
);

-- Create tab items table
CREATE TABLE public.tab_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tab_id UUID NOT NULL REFERENCES public.tabs(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tables
CREATE POLICY "Company users can manage tables"
ON public.tables
FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for tabs
CREATE POLICY "Company users can manage tabs"
ON public.tabs
FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for tab_items
CREATE POLICY "Company users can manage tab items"
ON public.tab_items
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.tabs t
  WHERE t.id = tab_items.tab_id
  AND (user_belongs_to_company(auth.uid(), t.company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tabs t
  WHERE t.id = tab_items.tab_id
  AND (user_belongs_to_company(auth.uid(), t.company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
));

-- Trigger for updated_at
CREATE TRIGGER update_tables_updated_at
BEFORE UPDATE ON public.tables
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tabs_updated_at
BEFORE UPDATE ON public.tabs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for tables and tabs
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tabs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_items;
