
ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS conversion_factor numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stock_unit text,
  ADD COLUMN IF NOT EXISTS sale_price numeric,
  ADD COLUMN IF NOT EXISTS unit_weight_kg numeric;
