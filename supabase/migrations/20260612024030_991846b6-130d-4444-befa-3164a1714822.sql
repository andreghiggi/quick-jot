
-- Fase 1: marcação fiscal/não-fiscal na Frente de Caixa
ALTER TABLE public.pdv_sales
  ADD COLUMN IF NOT EXISTS fiscal_mode TEXT NOT NULL DEFAULT 'nao_fiscal'
  CHECK (fiscal_mode IN ('fiscal','nao_fiscal'));

ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS default_fiscal_mode TEXT NOT NULL DEFAULT 'ask'
  CHECK (default_fiscal_mode IN ('fiscal','nao_fiscal','ask'));
