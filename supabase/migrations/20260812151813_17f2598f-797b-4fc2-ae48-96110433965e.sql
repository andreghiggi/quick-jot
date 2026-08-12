ALTER TABLE categories ADD COLUMN IF NOT EXISTS production_print BOOLEAN DEFAULT true;
GRANT ALL ON categories TO authenticated, service_role;

-- Ativar a impressão automática de produção para a Amore Mio
INSERT INTO store_settings (company_id, key, value) 
VALUES ('f5f9eec3-67bc-497a-88a6-ce41d3b15df8', 'auto_print_production_ticket', 'true') 
ON CONFLICT (company_id, key) DO UPDATE SET value = 'true';
GRANT ALL ON store_settings TO authenticated, service_role;
