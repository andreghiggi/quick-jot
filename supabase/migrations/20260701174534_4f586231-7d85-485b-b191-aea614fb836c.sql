DO $$
DECLARE
  r record;
  cid uuid;
  maxn int;
  nextn int;
BEGIN
  FOR r IN SELECT id, company_id FROM public.products WHERE code IS NULL ORDER BY company_id, created_at LOOP
    IF cid IS DISTINCT FROM r.company_id THEN
      cid := r.company_id;
      SELECT COALESCE(MAX((substring(code from '^P(\d+)$'))::int), 0) INTO maxn
        FROM public.products WHERE company_id = cid AND code ~ '^P\d+$';
      nextn := maxn;
    END IF;
    nextn := nextn + 1;
    UPDATE public.products SET code = 'P' || LPAD(nextn::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;