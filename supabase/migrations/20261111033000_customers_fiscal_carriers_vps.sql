-- Campos fiscais de clientes + transportadores (idempotente; espelha deploy/sql/2026-11-09).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS ibge_code text,
  ADD COLUMN IF NOT EXISTS person_type text NOT NULL DEFAULT 'PF',
  ADD COLUMN IF NOT EXISTS ie text,
  ADD COLUMN IF NOT EXISTS ind_ie_dest text NOT NULL DEFAULT '9',
  ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE IF NOT EXISTS public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  document text, state_registration text, phone text, zip_code text, address text, number text,
  neighborhood text, city text, state text, ibge_code text, vehicle_plate text, vehicle_state text,
  rntc text, notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carriers TO authenticated;
GRANT ALL ON public.carriers TO service_role;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "carriers company access" ON public.carriers;
CREATE POLICY "carriers company access" ON public.carriers FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_carriers_company ON public.carriers(company_id);
DROP TRIGGER IF EXISTS trg_carriers_updated_at ON public.carriers;
CREATE TRIGGER trg_carriers_updated_at BEFORE UPDATE ON public.carriers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
NOTIFY pgrst, 'reload schema';
