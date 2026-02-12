
-- Table to track NFC-e emissions linked to PDV sales
CREATE TABLE public.nfce_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  sale_id UUID REFERENCES public.pdv_sales(id),
  external_id TEXT NOT NULL,
  nfce_id TEXT,
  numero TEXT,
  serie TEXT,
  chave_acesso TEXT,
  protocolo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  ambiente TEXT DEFAULT 'homologacao',
  valor_total NUMERIC NOT NULL DEFAULT 0,
  qrcode_url TEXT,
  motivo_rejeicao TEXT,
  xml_url TEXT,
  request_payload JSONB,
  response_payload JSONB,
  webhook_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nfce_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company users can manage nfce records"
ON public.nfce_records
FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_nfce_records_updated_at
BEFORE UPDATE ON public.nfce_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_nfce_records_company_id ON public.nfce_records(company_id);
CREATE INDEX idx_nfce_records_sale_id ON public.nfce_records(sale_id);
CREATE INDEX idx_nfce_records_external_id ON public.nfce_records(external_id);
CREATE INDEX idx_nfce_records_status ON public.nfce_records(status);
