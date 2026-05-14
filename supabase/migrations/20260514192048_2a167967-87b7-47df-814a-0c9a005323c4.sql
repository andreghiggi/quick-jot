
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS swappable_in_order boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS added_after boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS swapped_from text;
