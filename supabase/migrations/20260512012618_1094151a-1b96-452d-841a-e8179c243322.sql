ALTER TABLE public.tabs
  ADD COLUMN IF NOT EXISTS transfer_log jsonb NOT NULL DEFAULT '[]'::jsonb;