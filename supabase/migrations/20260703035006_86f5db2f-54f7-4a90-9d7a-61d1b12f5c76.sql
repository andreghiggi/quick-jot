
-- 1) Novos campos em accounts_receivable
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS interest_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin_type text,
  ADD COLUMN IF NOT EXISTS origin_id uuid;

CREATE INDEX IF NOT EXISTS idx_ar_document_number ON public.accounts_receivable(company_id, document_number);
CREATE INDEX IF NOT EXISTS idx_ar_due_date ON public.accounts_receivable(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_ar_status ON public.accounts_receivable(company_id, status);

-- 2) Novos campos em accounts_payable
ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS interest_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin_type text,
  ADD COLUMN IF NOT EXISTS origin_id uuid;

CREATE INDEX IF NOT EXISTS idx_ap_document_number ON public.accounts_payable(company_id, document_number);
CREATE INDEX IF NOT EXISTS idx_ap_due_date ON public.accounts_payable(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_ap_status ON public.accounts_payable(company_id, status);

-- 3) Contador por empresa+prefixo (para PV000000151 etc.)
CREATE TABLE IF NOT EXISTS public.finance_document_counters (
  company_id uuid NOT NULL,
  prefix text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, prefix)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_document_counters TO authenticated;
GRANT ALL ON public.finance_document_counters TO service_role;

ALTER TABLE public.finance_document_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage finance counters"
  ON public.finance_document_counters FOR ALL
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- 4) Função geradora de número de documento (formato PV000000151/1-1)
CREATE OR REPLACE FUNCTION public.next_finance_document_number(_company_id uuid, _prefix text, _installment int DEFAULT 1, _total int DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO public.finance_document_counters (company_id, prefix, next_value)
  VALUES (_company_id, _prefix, 2)
  ON CONFLICT (company_id, prefix) DO UPDATE
    SET next_value = finance_document_counters.next_value + 1,
        updated_at = now()
  RETURNING (next_value - 1) INTO v_next;

  RETURN _prefix || LPAD(v_next::text, 9, '0') || '/' || _installment::text || '-' || _total::text;
END;
$$;

-- 5) Histórico de renegociações
CREATE TABLE IF NOT EXISTS public.accounts_renegotiations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('receivable','payable')),
  account_id uuid NOT NULL,
  old_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  old_due_date date NOT NULL,
  new_due_date date NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renegot_account ON public.accounts_renegotiations(account_type, account_id);
CREATE INDEX IF NOT EXISTS idx_renegot_company ON public.accounts_renegotiations(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_renegotiations TO authenticated;
GRANT ALL ON public.accounts_renegotiations TO service_role;

ALTER TABLE public.accounts_renegotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage renegotiations"
  ON public.accounts_renegotiations FOR ALL
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
