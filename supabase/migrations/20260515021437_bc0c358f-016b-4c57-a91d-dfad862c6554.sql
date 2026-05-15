ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS show_for_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_for_pickup   boolean NOT NULL DEFAULT true;