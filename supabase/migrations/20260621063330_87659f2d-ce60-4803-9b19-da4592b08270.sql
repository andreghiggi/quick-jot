
-- 1. Add fiscalflow_empresa_id column to companies (does NOT touch NFC-e flow)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fiscalflow_empresa_id text;

-- 2. dfe_documentos
CREATE TABLE public.dfe_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscalflow_id text,
  chave_acesso text NOT NULL,
  nsu bigint,
  tipo text NOT NULL DEFAULT 'resumo',
  cnpj_emitente text,
  nome_emitente text,
  numero_nfe text,
  serie text,
  data_emissao timestamptz,
  valor_total numeric(14,2),
  tp_nf smallint,
  situacao_nfe text,
  status_manifestacao text NOT NULL DEFAULT 'pendente',
  data_manifestacao timestamptz,
  xml_path text,
  imported_at timestamptz,
  imported_invoice_id uuid,
  ignored boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave_acesso)
);
CREATE INDEX idx_dfe_documentos_company_status ON public.dfe_documentos(company_id, status_manifestacao);
CREATE INDEX idx_dfe_documentos_company_emissao ON public.dfe_documentos(company_id, data_emissao DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dfe_documentos TO authenticated;
GRANT ALL ON public.dfe_documentos TO service_role;
ALTER TABLE public.dfe_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem DFe da própria empresa"
  ON public.dfe_documentos FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários inserem DFe da própria empresa"
  ON public.dfe_documentos FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários atualizam DFe da própria empresa"
  ON public.dfe_documentos FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários excluem DFe da própria empresa"
  ON public.dfe_documentos FOR DELETE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER update_dfe_documentos_updated_at
  BEFORE UPDATE ON public.dfe_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. dfe_eventos
CREATE TABLE public.dfe_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.dfe_documentos(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  cstat text,
  xmotivo text,
  nprot text,
  justificativa text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dfe_eventos_documento ON public.dfe_eventos(documento_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dfe_eventos TO authenticated;
GRANT ALL ON public.dfe_eventos TO service_role;
ALTER TABLE public.dfe_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem eventos DFe da própria empresa"
  ON public.dfe_eventos FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários inserem eventos DFe da própria empresa"
  ON public.dfe_eventos FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- 4. purchase_invoices
CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dfe_documento_id uuid REFERENCES public.dfe_documentos(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  chave_acesso text,
  cnpj_emitente text,
  nome_emitente text,
  numero_nfe text,
  serie text,
  data_emissao timestamptz,
  valor_total numeric(14,2),
  xml_path text,
  status text NOT NULL DEFAULT 'lancada',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave_acesso)
);
CREATE INDEX idx_purchase_invoices_company ON public.purchase_invoices(company_id, data_emissao DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem NF-e de entrada da própria empresa"
  ON public.purchase_invoices FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários inserem NF-e de entrada da própria empresa"
  ON public.purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários atualizam NF-e de entrada da própria empresa"
  ON public.purchase_invoices FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários excluem NF-e de entrada da própria empresa"
  ON public.purchase_invoices FOR DELETE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER update_purchase_invoices_updated_at
  BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. purchase_invoice_items
CREATE TABLE public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  xml_codigo text,
  xml_descricao text,
  xml_ean text,
  xml_ncm text,
  xml_cfop text,
  xml_unidade text,
  quantidade numeric(14,4) NOT NULL DEFAULT 0,
  valor_unitario numeric(14,4) NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  stock_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_invoice_items_invoice ON public.purchase_invoice_items(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_items TO authenticated;
GRANT ALL ON public.purchase_invoice_items TO service_role;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem itens NF-e entrada da própria empresa"
  ON public.purchase_invoice_items FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários inserem itens NF-e entrada da própria empresa"
  ON public.purchase_invoice_items FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários atualizam itens NF-e entrada da própria empresa"
  ON public.purchase_invoice_items FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Usuários excluem itens NF-e entrada da própria empresa"
  ON public.purchase_invoice_items FOR DELETE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
