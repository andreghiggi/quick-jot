CREATE TABLE public.pinpdv_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  identifier text,
  request_payload jsonb,
  response_payload jsonb,
  http_status integer,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pinpdv_logs_company_created ON public.pinpdv_logs(company_id, created_at DESC);
CREATE INDEX idx_pinpdv_logs_identifier ON public.pinpdv_logs(identifier);

ALTER TABLE public.pinpdv_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view their pinpdv logs"
  ON public.pinpdv_logs FOR SELECT
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Service role can insert pinpdv logs"
  ON public.pinpdv_logs FOR INSERT
  WITH CHECK (true);
