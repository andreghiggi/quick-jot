
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS wholesale_min_qty numeric,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer,
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS is_scale_item boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scale_barcode text,
  ADD COLUMN IF NOT EXISTS price_per_kg boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_ncm ON public.products(ncm);
CREATE INDEX IF NOT EXISTS idx_products_scale_barcode ON public.products(scale_barcode) WHERE scale_barcode IS NOT NULL;
