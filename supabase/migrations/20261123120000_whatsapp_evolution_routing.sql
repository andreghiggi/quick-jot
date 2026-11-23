-- Roteamento por empresa para o servidor Evolution.
-- Sem registro = Evolution atual (2.3.x). server = 'v24' = Evolution 2.4 (piloto).
CREATE TABLE IF NOT EXISTS public.whatsapp_evolution_routing (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  server text NOT NULL DEFAULT 'v24' CHECK (server IN ('v23', 'v24')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_evolution_routing ENABLE ROW LEVEL SECURITY;

-- Só super admin enxerga pelo painel; as edge functions usam a chave de serviço.
DROP POLICY IF EXISTS "Super admins view evolution routing" ON public.whatsapp_evolution_routing;
CREATE POLICY "Super admins view evolution routing" ON public.whatsapp_evolution_routing
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Piloto: Terra Viva Floricultura usa a Evolution 2.4. As demais lojas não mudam.
INSERT INTO public.whatsapp_evolution_routing (company_id, server, note)
SELECT id, 'v24', 'Piloto Evolution 2.4 (23/11/2026)'
FROM public.companies WHERE slug = 'terraviva'
ON CONFLICT (company_id) DO NOTHING;
