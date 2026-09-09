-- Multi-impressora por categoria (dev local / branch Cursor)
-- Aplicar no Supabase EXTERNO via SQL Editor — não deploy produção.

CREATE TYPE public.print_job_type AS ENUM ('production', 'receipt', 'drawer', 'other');

CREATE TABLE IF NOT EXISTS public.print_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  handles_receipt BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE TABLE IF NOT EXISTS public.category_print_stations (
  category_id UUID PRIMARY KEY REFERENCES public.categories(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.print_stations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_print_stations_company ON public.print_stations(company_id);
CREATE INDEX IF NOT EXISTS idx_category_print_stations_station ON public.category_print_stations(station_id);
CREATE INDEX IF NOT EXISTS idx_category_print_stations_company ON public.category_print_stations(company_id);

ALTER TABLE public.print_queue
  ADD COLUMN IF NOT EXISTS station_id UUID REFERENCES public.print_stations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_type public.print_job_type NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS source_order_id UUID;

CREATE INDEX IF NOT EXISTS idx_print_queue_station ON public.print_queue(station_id) WHERE NOT printed;

ALTER TABLE public.print_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_print_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage print_stations"
  ON public.print_stations FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company users manage category_print_stations"
  ON public.category_print_stations FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Anon read print_stations"
  ON public.print_stations FOR SELECT TO anon USING (true);
