ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS menu_item boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdv_item boolean NOT NULL DEFAULT true;

ALTER TABLE public.subcategories
  ADD COLUMN IF NOT EXISTS menu_item boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdv_item boolean NOT NULL DEFAULT true;