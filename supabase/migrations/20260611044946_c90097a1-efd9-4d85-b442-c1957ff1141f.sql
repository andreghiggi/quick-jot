ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS cash_control_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blind_close_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_movement_reason boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_sale_without_price boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_price_change_on_sale boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS confirm_quantity_above integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_print_on_finish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_open_drawer_cash boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clear_screen_after_sale boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_print_second_copy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_show_review_qr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_qr_url text NOT NULL DEFAULT '';