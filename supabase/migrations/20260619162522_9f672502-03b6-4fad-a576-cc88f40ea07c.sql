
-- =========================================================
-- COMBOS v1.6 — piloto Rei do Açaí
-- =========================================================

-- ----- combos -----
CREATE TABLE public.combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  gtin text,
  description text,
  image_url text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  pdv_item boolean NOT NULL DEFAULT true,
  menu_item boolean NOT NULL DEFAULT true,
  waiter_item boolean NOT NULL DEFAULT true,
  -- Fiscal: padrão "explodido" (cada item componente vira <det> na NFC-e).
  -- "kit_comercial" reservado para uso futuro (combo como item fiscal único).
  fiscal_mode text NOT NULL DEFAULT 'explodido' CHECK (fiscal_mode IN ('explodido','kit_comercial')),
  ncm text,
  cfop text,
  cest text,
  tax_rule_id uuid REFERENCES public.tax_rules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX combos_company_idx ON public.combos(company_id);
CREATE INDEX combos_company_active_idx ON public.combos(company_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combos TO authenticated;
GRANT SELECT ON public.combos TO anon;
GRANT ALL ON public.combos TO service_role;

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage combos"
  ON public.combos FOR ALL
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Public can read active combos"
  ON public.combos FOR SELECT
  TO anon
  USING (active = true);

CREATE TRIGGER combos_set_updated_at
  BEFORE UPDATE ON public.combos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----- combo_items -----
CREATE TABLE public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX combo_items_combo_idx ON public.combo_items(combo_id);
CREATE INDEX combo_items_product_idx ON public.combo_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combo_items TO authenticated;
GRANT SELECT ON public.combo_items TO anon;
GRANT ALL ON public.combo_items TO service_role;

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage combo_items"
  ON public.combo_items FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_items.combo_id
      AND public.user_belongs_to_company(auth.uid(), c.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_items.combo_id
      AND public.user_belongs_to_company(auth.uid(), c.company_id)
  ));

CREATE POLICY "Public can read items of active combos"
  ON public.combo_items FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_items.combo_id AND c.active = true
  ));

CREATE TRIGGER combo_items_set_updated_at
  BEFORE UPDATE ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----- combo_categories (N:N) -----
CREATE TABLE public.combo_categories (
  combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (combo_id, category_id)
);

CREATE INDEX combo_categories_category_idx ON public.combo_categories(category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combo_categories TO authenticated;
GRANT SELECT ON public.combo_categories TO anon;
GRANT ALL ON public.combo_categories TO service_role;

ALTER TABLE public.combo_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage combo_categories"
  ON public.combo_categories FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_categories.combo_id
      AND public.user_belongs_to_company(auth.uid(), c.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_categories.combo_id
      AND public.user_belongs_to_company(auth.uid(), c.company_id)
  ));

CREATE POLICY "Public can read categories of active combos"
  ON public.combo_categories FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_categories.combo_id AND c.active = true
  ));
