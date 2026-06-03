ALTER TABLE public.coupons DROP COLUMN IF EXISTS free_shipping;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders DROP COLUMN IF EXISTS free_shipping_applied;