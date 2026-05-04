-- Alteração 1: Campos fiscais no cadastro de produto
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS gtin text,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS icms_origin text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS net_weight numeric,
  ADD COLUMN IF NOT EXISTS gross_weight numeric;

-- Alteração 2: Máx por item nos grupos de adicionais
ALTER TABLE public.optional_groups
  ADD COLUMN IF NOT EXISTS max_quantity_per_item integer NOT NULL DEFAULT 1;