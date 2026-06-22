
-- Contador por loja
CREATE TABLE IF NOT EXISTS public.pdv_sale_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pdv_sale_number_counters TO authenticated;
GRANT ALL ON public.pdv_sale_number_counters TO service_role;

ALTER TABLE public.pdv_sale_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company users can read pv counter"
ON public.pdv_sale_number_counters
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Coluna sequencial em pdv_sales
ALTER TABLE public.pdv_sales
  ADD COLUMN IF NOT EXISTS pv_numero bigint;

CREATE UNIQUE INDEX IF NOT EXISTS pdv_sales_company_pv_numero_uidx
  ON public.pdv_sales(company_id, pv_numero)
  WHERE pv_numero IS NOT NULL;

-- Trigger que atribui pv_numero automaticamente
CREATE OR REPLACE FUNCTION public.assign_pdv_sale_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF NEW.pv_numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pdv_sale_number_counters (company_id, next_value)
  VALUES (NEW.company_id, 2)
  ON CONFLICT (company_id) DO UPDATE
    SET next_value = pdv_sale_number_counters.next_value + 1,
        updated_at = now()
  RETURNING (next_value - 1) INTO v_next;

  NEW.pv_numero := v_next;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pdv_sale_number ON public.pdv_sales;
CREATE TRIGGER trg_assign_pdv_sale_number
BEFORE INSERT ON public.pdv_sales
FOR EACH ROW EXECUTE FUNCTION public.assign_pdv_sale_number();
