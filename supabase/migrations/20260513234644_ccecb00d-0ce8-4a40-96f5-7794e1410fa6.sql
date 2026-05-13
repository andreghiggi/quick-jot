
CREATE TABLE public.tef_webservice_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid,
  action text NOT NULL,
  identifier text,
  cnpj text,
  pdv text,
  request_payload jsonb,
  response_payload jsonb,
  parsed_response jsonb,
  http_status integer,
  success boolean,
  approved boolean,
  nsu text,
  autorizacao text,
  bandeira text,
  valor numeric,
  error_message text,
  duration_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_tef_logs_company_created ON public.tef_webservice_logs (company_id, created_at DESC);
CREATE INDEX idx_tef_logs_identifier ON public.tef_webservice_logs (identifier);
CREATE INDEX idx_tef_logs_nsu ON public.tef_webservice_logs (nsu) WHERE nsu IS NOT NULL;

ALTER TABLE public.tef_webservice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view their tef logs"
  ON public.tef_webservice_logs
  FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role can insert tef logs"
  ON public.tef_webservice_logs
  FOR INSERT
  WITH CHECK (true);
