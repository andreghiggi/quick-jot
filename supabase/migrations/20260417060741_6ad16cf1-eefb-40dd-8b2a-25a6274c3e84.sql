ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS license_block_scheduled_for timestamptz,
ADD COLUMN IF NOT EXISTS license_block_scheduled_by uuid;