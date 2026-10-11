CREATE OR REPLACE FUNCTION public.is_company_module_enabled(_company_id uuid, _module_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_modules
    WHERE company_id = _company_id
      AND module_name = _module_name
      AND enabled = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_module_enabled(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_module_enabled(uuid, text) TO anon, authenticated, service_role;