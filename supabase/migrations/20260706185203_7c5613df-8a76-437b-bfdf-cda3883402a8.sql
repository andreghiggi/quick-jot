ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS complement text;