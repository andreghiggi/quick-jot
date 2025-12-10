-- Add daily_number column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS daily_number integer DEFAULT 1;

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for categories (public access since no auth)
CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Categories can be created by anyone" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Categories can be updated by anyone" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Categories can be deleted by anyone" ON public.categories FOR DELETE USING (true);

-- Create store_settings table for banner and other settings
CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on store_settings
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for store_settings
CREATE POLICY "Store settings are viewable by everyone" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "Store settings can be created by anyone" ON public.store_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Store settings can be updated by anyone" ON public.store_settings FOR UPDATE USING (true);

-- Insert default categories
INSERT INTO public.categories (name, display_order) VALUES 
  ('Lanches', 1),
  ('Bebidas', 2),
  ('Porções', 3),
  ('Sobremesas', 4)
ON CONFLICT (name) DO NOTHING;

-- Create function to get next daily order number
CREATE OR REPLACE FUNCTION public.get_next_daily_order_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_start timestamptz;
  today_end timestamptz;
  next_number integer;
BEGIN
  today_start := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  today_end := today_start + interval '1 day';
  
  SELECT COALESCE(MAX(daily_number), 0) + 1
  INTO next_number
  FROM public.orders
  WHERE created_at >= today_start AND created_at < today_end;
  
  RETURN next_number;
END;
$$;

-- Create trigger to automatically set daily_number on insert
CREATE OR REPLACE FUNCTION public.set_daily_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.daily_number := public.get_next_daily_order_number();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_daily_order_number ON public.orders;
CREATE TRIGGER trigger_set_daily_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_daily_order_number();