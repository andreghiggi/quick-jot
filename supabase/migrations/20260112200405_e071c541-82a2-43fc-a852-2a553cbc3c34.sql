-- Remover a constraint única antiga que só considera 'key'
ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_key_key;

-- Criar nova constraint única que considera 'key' + 'company_id'
ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_key_company_unique UNIQUE (key, company_id);