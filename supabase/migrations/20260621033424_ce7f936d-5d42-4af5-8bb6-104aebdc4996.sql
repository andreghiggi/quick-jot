ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pdv_sale_id uuid REFERENCES public.pdv_sales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pdv_sale_id ON public.orders(pdv_sale_id);
ALTER TABLE public.pdv_sales ADD COLUMN IF NOT EXISTS imported_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pdv_sales_imported_order_id ON public.pdv_sales(imported_order_id);