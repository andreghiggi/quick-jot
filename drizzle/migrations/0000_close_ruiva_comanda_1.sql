DO $$
DECLARE
  _cid uuid := '55181771-8b10-4af1-afc3-472c090a49be';
  _ids uuid[];
  _tables uuid[];
BEGIN
  SELECT array_agg(id), array_agg(table_id) FILTER (WHERE table_id IS NOT NULL)
    INTO _ids, _tables
    FROM public.tabs
   WHERE company_id = _cid AND status = 'open'
     AND (tab_number = 1 OR comanda_number = 1);
  IF _ids IS NULL THEN RETURN; END IF;
  IF array_length(_ids, 1) > 1 THEN
    RAISE EXCEPTION 'Mais de uma comanda 1 aberta; abortado por seguranca';
  END IF;
  UPDATE public.tabs SET status = 'closed', closed_at = now() WHERE id = ANY(_ids);
  UPDATE public.tables t SET status = 'available'
   WHERE t.id = ANY(COALESCE(_tables, '{}'::uuid[]))
     AND NOT EXISTS (SELECT 1 FROM public.tabs x WHERE x.table_id = t.id AND x.status = 'open');
END $$;