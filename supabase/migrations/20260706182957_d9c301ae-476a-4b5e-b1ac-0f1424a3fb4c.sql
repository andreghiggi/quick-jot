ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS crediario_receipt_copies smallint NOT NULL DEFAULT 2
  CHECK (crediario_receipt_copies IN (1, 2));