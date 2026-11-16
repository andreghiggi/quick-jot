-- Auditoria das decisões de autorização da edge function whatsapp-evolution.
-- Só a função (service role) grava e lê; anon/authenticated não têm acesso.
CREATE TABLE IF NOT EXISTS public.whatsapp_authz_audit (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  decision text NOT NULL,
  reason text NOT NULL,
  action text,
  company_id text,
  instance_name text,
  user_id text,
  enforced boolean NOT NULL DEFAULT false
);
ALTER TABLE public.whatsapp_authz_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_authz_audit FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_whatsapp_authz_audit_created ON public.whatsapp_authz_audit (created_at DESC);
