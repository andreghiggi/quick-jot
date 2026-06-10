
CREATE TABLE IF NOT EXISTS public.nfce_inutilizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  serie text NOT NULL,
  numero_inicial integer NOT NULL,
  numero_final integer NOT NULL,
  ano integer NOT NULL,
  justificativa text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  protocolo text,
  ambiente text,
  external_id text,
  request_payload jsonb,
  response_payload jsonb,
  motivo_rejeicao text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(justificativa) >= 15),
  CHECK (numero_final >= numero_inicial)
);

CREATE INDEX IF NOT EXISTS idx_nfce_inut_company ON public.nfce_inutilizacoes(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.nfce_inutilizacoes TO authenticated;
GRANT ALL ON public.nfce_inutilizacoes TO service_role;

ALTER TABLE public.nfce_inutilizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view their company inutilizacoes"
  ON public.nfce_inutilizacoes FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "users insert inutilizacoes for their company"
  ON public.nfce_inutilizacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "users update inutilizacoes for their company"
  ON public.nfce_inutilizacoes FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER trg_nfce_inut_updated_at
  BEFORE UPDATE ON public.nfce_inutilizacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
