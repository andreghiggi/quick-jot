ALTER TABLE public.nfce_records ADD COLUMN IF NOT EXISTS xml_content text;
CREATE INDEX IF NOT EXISTS idx_nfce_records_company_created ON public.nfce_records(company_id, created_at DESC);