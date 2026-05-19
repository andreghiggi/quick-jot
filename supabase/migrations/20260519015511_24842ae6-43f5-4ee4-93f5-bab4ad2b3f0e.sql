-- 1. Adiciona campo de custo na tabela products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric;

-- 2. Cria tabela de histórico de custo
CREATE TABLE IF NOT EXISTS public.product_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  company_id uuid,
  old_cost numeric,
  new_cost numeric,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pch_product_id ON public.product_cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_pch_company_id ON public.product_cost_history(company_id);
CREATE INDEX IF NOT EXISTS idx_pch_created_at ON public.product_cost_history(created_at);

-- 3. Habilita RLS
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "Cost history managed by company users" ON public.product_cost_history;
CREATE POLICY "Cost history managed by company users"
  ON public.product_cost_history
  FOR ALL
  TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 5. Trigger function para registrar mudanças de custo
CREATE OR REPLACE FUNCTION public.log_product_cost_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.cost_price, -1) IS DISTINCT FROM COALESCE(OLD.cost_price, -1) THEN
    INSERT INTO public.product_cost_history (product_id, company_id, old_cost, new_cost, changed_by)
    VALUES (NEW.id, NEW.company_id, OLD.cost_price, NEW.cost_price, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Trigger na tabela products
DROP TRIGGER IF EXISTS trg_log_product_cost_change ON public.products;
CREATE TRIGGER trg_log_product_cost_change
  AFTER UPDATE OF cost_price ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.log_product_cost_change();