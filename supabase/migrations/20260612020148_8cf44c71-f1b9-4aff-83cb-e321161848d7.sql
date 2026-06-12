ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS stock_move_on_fiscal_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_on_finish_mode text NOT NULL DEFAULT 'off';

-- Sincroniza enum com o boolean legado para lojas que já ligaram o toggle na Fase A
UPDATE public.pdv_settings
  SET print_on_finish_mode = 'auto'
  WHERE auto_print_on_finish = true
    AND print_on_finish_mode = 'off';

ALTER TABLE public.pdv_settings
  ADD CONSTRAINT pdv_settings_print_on_finish_mode_check
  CHECK (print_on_finish_mode IN ('off', 'auto', 'ask'));