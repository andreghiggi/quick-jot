-- Add printed column to orders table to track print status
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS printed boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS printed_at timestamptz DEFAULT null;