-- Create delivery_neighborhoods table for neighborhood-based delivery fees
CREATE TABLE public.delivery_neighborhoods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  neighborhood_name TEXT NOT NULL,
  delivery_fee NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, neighborhood_name)
);

-- Enable RLS
ALTER TABLE public.delivery_neighborhoods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Company users can manage their neighborhoods"
ON public.delivery_neighborhoods
FOR ALL
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'));

-- Public read for menu
CREATE POLICY "Neighborhoods viewable publicly for menu"
ON public.delivery_neighborhoods
FOR SELECT
USING (active = true);

-- Create trigger for updated_at
CREATE TRIGGER update_delivery_neighborhoods_updated_at
BEFORE UPDATE ON public.delivery_neighborhoods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();