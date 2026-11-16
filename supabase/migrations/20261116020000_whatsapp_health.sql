-- Saude do WhatsApp por instancia. Preenchida pelo monitor da VPS (a cada 30 min)
-- e lida pelo painel /admin/whatsapp-saude (somente super admin).
CREATE TABLE IF NOT EXISTS public.whatsapp_health (
  instance_name text PRIMARY KEY,
  company_id uuid,
  company_name text,
  status text NOT NULL,            -- ok | deaf | state | disconnected | error
  detail text,
  evolution_state text,
  last_in timestamptz,
  last_out timestamptz,
  checked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_health FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_health TO authenticated;

DROP POLICY IF EXISTS "Super admins can view whatsapp health" ON public.whatsapp_health;
CREATE POLICY "Super admins can view whatsapp health"
  ON public.whatsapp_health
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
