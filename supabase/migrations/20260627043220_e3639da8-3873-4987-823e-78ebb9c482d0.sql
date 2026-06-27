
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sell_by_weight boolean NOT NULL DEFAULT false;
