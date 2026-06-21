ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'cardapio'
  CHECK (product_type IN ('cardapio', 'mercado', 'ambos'));

UPDATE public.products
SET product_type = CASE
  WHEN COALESCE(pdv_item, false) = true AND COALESCE(menu_item, false) = false THEN 'mercado'
  WHEN COALESCE(menu_item, false) = true AND COALESCE(pdv_item, false) = true THEN 'ambos'
  ELSE 'cardapio'
END;

CREATE INDEX IF NOT EXISTS idx_products_company_type
  ON public.products (company_id, product_type);