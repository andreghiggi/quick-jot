CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  tables_processed int NOT NULL DEFAULT 0,
  rows_copied bigint NOT NULL DEFAULT 0,
  duration_ms int,
  error_message text,
  details jsonb
);

GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view backup runs"
ON public.backup_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_backup_runs_started_at ON public.backup_runs(started_at DESC);