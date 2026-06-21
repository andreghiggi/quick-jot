
-- 1. Adiciona toggle por loja
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS auto_generate_gtin BOOLEAN NOT NULL DEFAULT false;

-- 2. Função: gera EAN-13 interno com prefixo "2" (reservado GS1 para uso interno)
--    Formato: 2 + 11 dígitos aleatórios + dígito verificador EAN-13
--    Único por empresa (loop até não colidir).
CREATE OR REPLACE FUNCTION public.generate_internal_ean13(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  i int;
  sum_ int;
  digit int;
  check_digit int;
  candidate text;
  exists_check int;
  attempts int := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    EXIT WHEN attempts > 50;

    -- 12 primeiros dígitos: "2" + 11 aleatórios
    base := '2';
    FOR i IN 1..11 LOOP
      base := base || floor(random() * 10)::int::text;
    END LOOP;

    -- Dígito verificador EAN-13
    sum_ := 0;
    FOR i IN 1..12 LOOP
      digit := substring(base from i for 1)::int;
      IF i % 2 = 1 THEN
        sum_ := sum_ + digit;       -- posições ímpares (1,3,5...): peso 1
      ELSE
        sum_ := sum_ + digit * 3;   -- posições pares (2,4,6...): peso 3
      END IF;
    END LOOP;
    check_digit := (10 - (sum_ % 10)) % 10;
    candidate := base || check_digit::text;

    -- Garante unicidade dentro da empresa
    SELECT count(*) INTO exists_check
      FROM public.products
      WHERE company_id = _company_id AND gtin = candidate;

    EXIT WHEN exists_check = 0;
  END LOOP;

  RETURN candidate;
END;
$$;

-- 3. Trigger: se gtin vazio e a loja tiver auto_generate_gtin = true, gera automaticamente
CREATE OR REPLACE FUNCTION public.auto_fill_product_gtin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  -- Só age quando gtin está vazio
  IF NEW.gtin IS NOT NULL AND length(trim(NEW.gtin)) > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(auto_generate_gtin, false) INTO v_enabled
    FROM public.pdv_settings
    WHERE company_id = NEW.company_id;

  IF COALESCE(v_enabled, false) = true THEN
    NEW.gtin := public.generate_internal_ean13(NEW.company_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_product_gtin ON public.products;
CREATE TRIGGER trg_auto_fill_product_gtin
  BEFORE INSERT OR UPDATE OF gtin, company_id ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fill_product_gtin();
