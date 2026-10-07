CREATE OR REPLACE FUNCTION public.comanda_cards_allowed(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _company_id IS NOT NULL
$$;