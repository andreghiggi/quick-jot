
CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_dup_id uuid;
  v_dup_name text;
BEGIN
  v_digits := regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g');
  IF length(v_digits) = 0 THEN
    RETURN NEW;
  END IF;
  IF length(v_digits) NOT IN (11, 14) THEN
    RETURN NEW; -- deixa passar valores que não são CPF/CNPJ (não bloqueia)
  END IF;

  SELECT id, name INTO v_dup_id, v_dup_name
    FROM public.customers
   WHERE company_id = NEW.company_id
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_digits
   LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um cliente cadastrado com este CPF/CNPJ: %', v_dup_name
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_customer_cpf ON public.customers;
CREATE TRIGGER trg_prevent_duplicate_customer_cpf
BEFORE INSERT OR UPDATE OF cpf, company_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_customer_cpf();
