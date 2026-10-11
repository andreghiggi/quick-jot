CREATE OR REPLACE FUNCTION public.is_company_module_enabled(_company_id uuid, _module_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _module_name <> 'floricultura' THEN false ELSE COALESCE((
    SELECT enabled FROM public.company_modules
    WHERE company_id = _company_id AND module_name = 'floricultura' LIMIT 1), false) END
$$;