
-- 1) Função: gera subdomínio limpo a partir de um texto
CREATE OR REPLACE FUNCTION public.generate_clean_subdomain(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text;
BEGIN
  -- minúsculas
  result := lower(coalesce(_input, ''));
  -- remove acentos comuns PT-BR
  result := translate(result,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');
  -- remove qualquer caractere que não seja letra minúscula ou número
  result := regexp_replace(result, '[^a-z0-9]', '', 'g');
  -- limita tamanho
  result := substring(result for 30);
  RETURN result;
END;
$$;

-- 2) Lista de subdomínios reservados
CREATE OR REPLACE FUNCTION public.is_reserved_subdomain(_subdomain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(_subdomain) = ANY(ARRAY[
    'app','www','admin','api','cardapio','painel',
    'mail','blog','ftp','webmail','comandatech',
    'root','test','staging','dev','support','suporte',
    'help','status','docs','assets','static','cdn',
    'auth','login','dashboard','portal'
  ]);
$$;

-- 3) Adiciona coluna subdomain
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subdomain text;

-- 4) Função para gerar subdomínio único para uma loja
CREATE OR REPLACE FUNCTION public.assign_unique_subdomain(_company_id uuid, _name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  counter int := 1;
  exists_check int;
BEGIN
  base := public.generate_clean_subdomain(_name);
  
  -- se ficou muito curto, completa com hash do id
  IF length(base) < 3 THEN
    base := base || substring(replace(_company_id::text, '-', '') for 8);
  END IF;
  
  candidate := base;
  
  -- se for reservado, prefixa com 'loja'
  IF public.is_reserved_subdomain(candidate) THEN
    candidate := 'loja' || candidate;
  END IF;
  
  -- garante unicidade
  LOOP
    SELECT count(*) INTO exists_check
      FROM public.companies
      WHERE subdomain = candidate AND id <> _company_id;
    EXIT WHEN exists_check = 0;
    counter := counter + 1;
    candidate := base || counter::text;
  END LOOP;
  
  RETURN candidate;
END;
$$;

-- 5) Popular subdomínio para todas as lojas existentes que ainda não têm
DO $$
DECLARE
  c record;
  new_sub text;
BEGIN
  FOR c IN SELECT id, name FROM public.companies WHERE subdomain IS NULL ORDER BY created_at LOOP
    new_sub := public.assign_unique_subdomain(c.id, c.name);
    UPDATE public.companies SET subdomain = new_sub WHERE id = c.id;
  END LOOP;
END $$;

-- 6) Constraint de unicidade e validação de formato
CREATE UNIQUE INDEX IF NOT EXISTS companies_subdomain_unique
  ON public.companies(subdomain)
  WHERE subdomain IS NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_subdomain_format;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_subdomain_format
  CHECK (
    subdomain IS NULL
    OR (
      subdomain ~ '^[a-z0-9]{3,30}$'
      AND NOT public.is_reserved_subdomain(subdomain)
    )
  );

-- 7) Trigger: gera subdomínio automático em INSERT se não fornecido
CREATE OR REPLACE FUNCTION public.set_company_subdomain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subdomain IS NULL OR NEW.subdomain = '' THEN
    NEW.subdomain := public.assign_unique_subdomain(NEW.id, NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_subdomain ON public.companies;
CREATE TRIGGER trg_set_company_subdomain
  BEFORE INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_subdomain();
