UPDATE public.company_modules
SET enabled = false
WHERE module_name = 'pdv_v2'
  AND company_id IN (SELECT id FROM public.companies WHERE name ILIKE '%bon appetit%');

UPDATE public.company_modules
SET enabled = true
WHERE module_name = 'pdv'
  AND company_id IN (SELECT id FROM public.companies WHERE name ILIKE '%bon appetit%');