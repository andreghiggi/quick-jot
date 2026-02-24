
-- 1. Optional Groups table
CREATE TABLE public.optional_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Optional Group Items table
CREATE TABLE public.optional_group_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.optional_groups(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Link groups to categories
CREATE TABLE public.optional_group_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.optional_groups(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  UNIQUE(group_id, category_id)
);

-- 4. Link groups to individual products
CREATE TABLE public.optional_group_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.optional_groups(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  UNIQUE(group_id, product_id)
);

-- RLS policies for optional_groups
ALTER TABLE public.optional_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Optional groups managed by company users"
  ON public.optional_groups FOR ALL
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Optional groups viewable publicly"
  ON public.optional_groups FOR SELECT
  USING (active = true);

-- RLS policies for optional_group_items
ALTER TABLE public.optional_group_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Optional group items managed by company users"
  ON public.optional_group_items FOR ALL
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Optional group items viewable publicly"
  ON public.optional_group_items FOR SELECT
  USING (active = true);

-- RLS policies for optional_group_categories
ALTER TABLE public.optional_group_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Optional group categories managed by company users"
  ON public.optional_group_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.optional_groups g
      WHERE g.id = optional_group_categories.group_id
      AND (user_belongs_to_company(auth.uid(), g.company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.optional_groups g
      WHERE g.id = optional_group_categories.group_id
      AND (user_belongs_to_company(auth.uid(), g.company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
    )
  );

CREATE POLICY "Optional group categories viewable publicly"
  ON public.optional_group_categories FOR SELECT
  USING (true);

-- RLS policies for optional_group_products
ALTER TABLE public.optional_group_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Optional group products managed by company users"
  ON public.optional_group_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.optional_groups g
      WHERE g.id = optional_group_products.group_id
      AND (user_belongs_to_company(auth.uid(), g.company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.optional_groups g
      WHERE g.id = optional_group_products.group_id
      AND (user_belongs_to_company(auth.uid(), g.company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
    )
  );

CREATE POLICY "Optional group products viewable publicly"
  ON public.optional_group_products FOR SELECT
  USING (true);

-- Updated_at trigger for optional_groups
CREATE TRIGGER update_optional_groups_updated_at
  BEFORE UPDATE ON public.optional_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
