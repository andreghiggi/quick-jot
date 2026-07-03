
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'a_vista',
  ADD COLUMN IF NOT EXISTS nfe_ref_code text,
  ADD COLUMN IF NOT EXISTS issue_nfce boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installments_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_interval integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_period text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS installment_start_rule text NOT NULL DEFAULT 'general';

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_payment_type_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_payment_type_check
  CHECK (payment_type IN ('a_vista','a_prazo','crediario'));

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_installment_period_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_installment_period_check
  CHECK (installment_period IN ('day','week','month'));

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_installment_start_rule_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_installment_start_rule_check
  CHECK (installment_start_rule IN ('general','fixed_days','next_month'));

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_nfe_ref_code_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_nfe_ref_code_check
  CHECK (nfe_ref_code IS NULL OR nfe_ref_code IN (
    '01','02','03','04','05','10','11','12','13','15','16','17','18','19','90','99'
  ));
