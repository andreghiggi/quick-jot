
-- 1. Update default for invoice_due_day to 20
ALTER TABLE public.reseller_settings 
  ALTER COLUMN invoice_due_day SET DEFAULT 20;

-- 2. Update all existing rows to use 20 as the standard due day
UPDATE public.reseller_settings 
  SET invoice_due_day = 20;

-- 3. Enable pg_cron + pg_net for scheduled invoice generation
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
