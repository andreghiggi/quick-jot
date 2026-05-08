UPDATE public.company_modules
SET enabled = false
WHERE module_name = 'pdv_v2'
  AND company_id IN (
    SELECT id FROM public.companies
    WHERE name ILIKE '%rei do açaí%'
       OR name ILIKE '%rei do acai%'
       OR name ILIKE '%bon appetit%'
       OR name ILIKE '%bon appétit%'
  );