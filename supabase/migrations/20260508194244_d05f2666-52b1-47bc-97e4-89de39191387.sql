-- Habilita o módulo pdv_v2 para todas as empresas existentes
INSERT INTO public.company_modules (company_id, module_name, enabled)
SELECT c.id, 'pdv_v2', true
FROM public.companies c
ON CONFLICT (company_id, module_name)
DO UPDATE SET enabled = true;