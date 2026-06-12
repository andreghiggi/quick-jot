ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS block_close_with_pending_sales boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_closing_report boolean NOT NULL DEFAULT false;