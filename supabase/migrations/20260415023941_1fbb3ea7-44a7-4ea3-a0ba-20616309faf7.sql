-- Add order_id column to pdv_sales to track sales originating from online orders
ALTER TABLE public.pdv_sales ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_pdv_sales_order_id ON public.pdv_sales(order_id);
