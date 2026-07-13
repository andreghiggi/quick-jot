ALTER TABLE public.nfce_records
  ADD COLUMN IF NOT EXISTS contingencia_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contingencia_efetivada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_nfce_records_contingencia_pendente
  ON public.nfce_records (company_id)
  WHERE contingencia_offline = true AND contingencia_efetivada = false;