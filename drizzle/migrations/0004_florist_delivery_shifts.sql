CREATE TABLE IF NOT EXISTS public.company_delivery_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  label text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cds_time_range CHECK (end_time > start_time),
  CONSTRAINT cds_label_len CHECK (char_length(label) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS idx_cds_company_day ON public.company_delivery_shifts(company_id, day_of_week, sort_order);

GRANT SELECT ON public.company_delivery_shifts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_delivery_shifts TO authenticated;
GRANT ALL ON public.company_delivery_shifts TO service_role;

ALTER TABLE public.company_delivery_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members manage delivery shifts" ON public.company_delivery_shifts;
CREATE POLICY "Company members manage delivery shifts"
ON public.company_delivery_shifts FOR ALL TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Public reads florist delivery shifts" ON public.company_delivery_shifts;
CREATE POLICY "Public reads florist delivery shifts"
ON public.company_delivery_shifts FOR SELECT TO anon, authenticated
USING (public.is_company_module_enabled(company_id, 'floricultura'));

DROP TRIGGER IF EXISTS trg_cds_updated_at ON public.company_delivery_shifts;
CREATE TRIGGER trg_cds_updated_at BEFORE UPDATE ON public.company_delivery_shifts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();