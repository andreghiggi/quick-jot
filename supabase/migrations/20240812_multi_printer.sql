CREATE TABLE public.print_stations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_stations TO authenticated;
GRANT ALL ON public.print_stations TO service_role;

ALTER TABLE public.print_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company print stations"
    ON public.print_stations
    FOR ALL
    TO authenticated
    USING (company_id = auth.uid()) -- Note: Adjust based on company membership check function if needed
    WITH CHECK (company_id = auth.uid());

CREATE TABLE public.category_print_stations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    station_id uuid REFERENCES public.print_stations(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_print_stations TO authenticated;
GRANT ALL ON public.category_print_stations TO service_role;

ALTER TABLE public.category_print_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company category print stations"
    ON public.category_print_stations
    FOR ALL
    TO authenticated
    USING (company_id = auth.uid())
    WITH CHECK (company_id = auth.uid());

ALTER TABLE public.print_queue ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.print_stations(id);
ALTER TABLE public.print_queue ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'production';
