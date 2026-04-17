-- 1. Add column
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS serial text UNIQUE;

-- 2. Generator function
CREATE OR REPLACE FUNCTION public.generate_company_serial()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text;
  i int;
  exists_check int;
BEGIN
  LOOP
    result := 'CT';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    SELECT count(*) INTO exists_check FROM public.companies WHERE serial = result;
    EXIT WHEN exists_check = 0;
  END LOOP;
  RETURN result;
END;
$$;

-- 3. Backfill BEFORE creating the protective trigger
DO $$
DECLARE
  c RECORD;
  new_serial text;
BEGIN
  FOR c IN SELECT id FROM public.companies WHERE serial IS NULL LOOP
    new_serial := public.generate_company_serial();
    UPDATE public.companies SET serial = new_serial WHERE id = c.id;
  END LOOP;
END $$;

-- 4. NOT NULL after backfill
ALTER TABLE public.companies ALTER COLUMN serial SET NOT NULL;

-- 5. Trigger function: auto-set on insert, immutable on update
CREATE OR REPLACE FUNCTION public.set_company_serial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.serial := public.generate_company_serial();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.serial IS DISTINCT FROM OLD.serial THEN
      RAISE EXCEPTION 'O serial da loja não pode ser alterado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Trigger
DROP TRIGGER IF EXISTS trg_set_company_serial ON public.companies;
CREATE TRIGGER trg_set_company_serial
BEFORE INSERT OR UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.set_company_serial();