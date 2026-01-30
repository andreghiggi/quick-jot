-- Remove the global unique constraint on category name 
-- Categories should be unique per company, not globally
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;

-- Create unique index per company (allowing same name across different companies)
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_company_unique 
ON public.categories (name, company_id) 
WHERE company_id IS NOT NULL;

-- Add a column for storing sort preference per company in store_settings (handled via app)
-- Add column for manual ordering if not exists (already has display_order)