
CREATE TABLE public.accounts_payable (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  description text NOT NULL,
  category text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  balance numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','canceled')),
  notes text,
  paid_at timestamptz,
  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their company accounts_payable"
  ON public.accounts_payable
  FOR ALL
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER update_accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_accounts_payable_company_due ON public.accounts_payable(company_id, due_date);
CREATE INDEX idx_accounts_payable_company_status ON public.accounts_payable(company_id, status);
CREATE INDEX idx_accounts_payable_supplier ON public.accounts_payable(supplier_id);


CREATE TABLE public.accounts_payable_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payable_id uuid NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable_payments TO authenticated;
GRANT ALL ON public.accounts_payable_payments TO service_role;

ALTER TABLE public.accounts_payable_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their company accounts_payable_payments"
  ON public.accounts_payable_payments
  FOR ALL
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER update_accounts_payable_payments_updated_at
  BEFORE UPDATE ON public.accounts_payable_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_accounts_payable_payments_payable ON public.accounts_payable_payments(payable_id);
CREATE INDEX idx_accounts_payable_payments_company_date ON public.accounts_payable_payments(company_id, paid_at);
