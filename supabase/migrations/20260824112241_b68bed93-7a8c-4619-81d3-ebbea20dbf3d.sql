ALTER TABLE public.print_stations ADD COLUMN IF NOT EXISTS printer_name text;
GRANT SELECT ON public.print_stations TO anon;