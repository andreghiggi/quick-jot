ALTER TABLE public.companies
  ADD COLUMN address_street TEXT,
  ADD COLUMN address_number TEXT,
  ADD COLUMN address_complement TEXT,
  ADD COLUMN address_neighborhood TEXT,
  ADD COLUMN address_reference TEXT;