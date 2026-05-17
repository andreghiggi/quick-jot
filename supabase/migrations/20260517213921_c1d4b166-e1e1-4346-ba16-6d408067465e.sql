
CREATE TABLE public.table_removal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  table_number integer NOT NULL,
  table_capacity integer,
  reason text NOT NULL,
  removed_by uuid,
  removed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_table_removal_logs_company ON public.table_removal_logs(company_id, created_at DESC);

ALTER TABLE public.table_removal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view their removal logs"
ON public.table_removal_logs FOR SELECT
TO authenticated
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company users can insert removal logs"
ON public.table_removal_logs FOR INSERT
TO authenticated
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));
