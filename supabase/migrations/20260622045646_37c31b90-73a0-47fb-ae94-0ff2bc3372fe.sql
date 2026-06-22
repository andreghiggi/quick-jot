ALTER TABLE public.pdv_sales ADD COLUMN IF NOT EXISTS source_module text NOT NULL DEFAULT 'pdv';
ALTER TABLE public.pdv_sales DROP CONSTRAINT IF EXISTS pdv_sales_source_module_check;
ALTER TABLE public.pdv_sales ADD CONSTRAINT pdv_sales_source_module_check CHECK (source_module IN ('pdv','mercado'));
CREATE INDEX IF NOT EXISTS pdv_sales_source_module_idx ON public.pdv_sales (cash_register_id, source_module);