-- Drop the unique constraint to allow multiple periods per day
ALTER TABLE public.business_hours DROP CONSTRAINT IF EXISTS business_hours_company_id_day_of_week_key;

-- Add period_number column to support multiple time slots per day
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS period_number INTEGER DEFAULT 1;

-- Create new composite unique constraint
ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_company_day_period_unique 
  UNIQUE (company_id, day_of_week, period_number);