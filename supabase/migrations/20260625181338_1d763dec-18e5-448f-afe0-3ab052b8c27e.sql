
-- Tabela: nfe_records
CREATE TABLE public.nfe_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  external_id text NOT NULL,
  nfe_id text,
  numero text,
  serie text,
  chave_acesso text,
  protocolo text,
  status text NOT NULL DEFAULT 'pendente',
  ambiente text DEFAULT 'homologacao',
  natureza_operacao text,
  finalidade integer DEFAULT 1,
  valor_total numeric NOT NULL DEFAULT 0,
  destinatario jsonb,
  danfe_url text,
  xml_url text,
  motivo_rejeicao text,
  request_payload jsonb,
  response_payload jsonb,
  webhook_payload jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nfe_records_company ON public.nfe_records(company_id, created_at DESC);
CREATE INDEX idx_nfe_records_external ON public.nfe_records(external_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_records TO authenticated;
GRANT ALL ON public.nfe_records TO service_role;

ALTER TABLE public.nfe_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read nfe_records"
ON public.nfe_records FOR SELECT TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "company members insert nfe_records"
ON public.nfe_records FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "company members update nfe_records"
ON public.nfe_records FOR UPDATE TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER trg_nfe_records_updated_at
BEFORE UPDATE ON public.nfe_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: nfe_inutilizacoes
CREATE TABLE public.nfe_inutilizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nfe_inut_company ON public.nfe_inutilizacoes(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_inutilizacoes TO authenticated;
GRANT ALL ON public.nfe_inutilizacoes TO service_role;

ALTER TABLE public.nfe_inutilizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read nfe_inut"
ON public.nfe_inutilizacoes FOR SELECT TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "company members insert nfe_inut"
ON public.nfe_inutilizacoes FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "company members update nfe_inut"
ON public.nfe_inutilizacoes FOR UPDATE TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER trg_nfe_inut_updated_at
BEFORE UPDATE ON public.nfe_inutilizacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- pdv_settings: campos específicos da NF-e (não interfere nos campos NFC-e)
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS nfe_serie text,
  ADD COLUMN IF NOT EXISTS nfe_proximo_numero integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfe_ambiente text DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS nfe_natureza_operacao text DEFAULT 'Venda',
  ADD COLUMN IF NOT EXISTS nfe_finalidade integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfe_print_danfe boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS nfe_print_format text DEFAULT 'a4';
