
-- 1) Toggle "Aceitar crediário" nas configurações do PDV/Frente de Caixa
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS credit_sale_enabled boolean NOT NULL DEFAULT false;

-- 2) Tabela: Contas a Receber (títulos gerados pelo crediário)
CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_document text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  balance numeric(12,2) NOT NULL CHECK (balance >= 0),
  issue_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  due_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','canceled')),
  origin text NOT NULL DEFAULT 'frente_caixa',
  pdv_sale_id uuid REFERENCES public.pdv_sales(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_receivable TO authenticated;
GRANT ALL ON public.accounts_receivable TO service_role;

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage AR of own company"
  ON public.accounts_receivable
  FOR ALL
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE INDEX IF NOT EXISTS idx_ar_company_status ON public.accounts_receivable(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_company_due    ON public.accounts_receivable(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_ar_customer       ON public.accounts_receivable(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_pdv_sale       ON public.accounts_receivable(pdv_sale_id);

CREATE TRIGGER trg_ar_updated_at
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Tabela: Recebimentos (baixas parciais ou totais de um título)
CREATE TABLE IF NOT EXISTS public.accounts_receivable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_name text NOT NULL,
  operator_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_receivable_payments TO authenticated;
GRANT ALL ON public.accounts_receivable_payments TO service_role;

ALTER TABLE public.accounts_receivable_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage AR payments of own company"
  ON public.accounts_receivable_payments
  FOR ALL
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE INDEX IF NOT EXISTS idx_arp_receivable ON public.accounts_receivable_payments(receivable_id);
CREATE INDEX IF NOT EXISTS idx_arp_company    ON public.accounts_receivable_payments(company_id, paid_at);

CREATE TRIGGER trg_arp_updated_at
  BEFORE UPDATE ON public.accounts_receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
