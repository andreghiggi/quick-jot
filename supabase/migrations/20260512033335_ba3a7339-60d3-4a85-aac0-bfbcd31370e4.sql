
UPDATE public.tables SET status = 'available'
WHERE id IN (
  SELECT table_id FROM public.tabs
  WHERE company_id = '32b71649-461d-4cb6-b26c-12390b090feb'
    AND status = 'open' AND table_id IS NOT NULL
);

DELETE FROM public.tab_items
WHERE tab_id IN (
  SELECT id FROM public.tabs
  WHERE company_id = '32b71649-461d-4cb6-b26c-12390b090feb'
    AND status = 'open'
);

DELETE FROM public.tabs
WHERE company_id = '32b71649-461d-4cb6-b26c-12390b090feb'
  AND status = 'open';
