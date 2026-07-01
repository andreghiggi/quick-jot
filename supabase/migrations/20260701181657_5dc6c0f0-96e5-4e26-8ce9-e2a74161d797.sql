
-- Módulo de Inventário (Fase 1 — Contagem Cega)

CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','counting','review','closed','canceled')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','category','custom')),
  scope_ref jsonb,
  notes text,
  opened_by uuid,
  closed_by uuid,
  closed_at timestamptz,
  total_items int NOT NULL DEFAULT 0,
  divergent_items int NOT NULL DEFAULT 0,
  adjustment_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_counts_company ON public.inventory_counts(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_counts TO authenticated;
GRANT ALL ON public.inventory_counts TO service_role;

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own company inventory counts"
  ON public.inventory_counts FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER trg_inventory_counts_updated_at
  BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Itens contados
CREATE TABLE public.inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric,
  recount_qty numeric,
  final_qty numeric,
  unit_cost numeric NOT NULL DEFAULT 0,
  variance numeric,
  approved boolean NOT NULL DEFAULT false,
  counted_at timestamptz,
  counted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);
CREATE INDEX idx_inv_count_items_count ON public.inventory_count_items(count_id);
CREATE INDEX idx_inv_count_items_company ON public.inventory_count_items(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_items TO authenticated;
GRANT ALL ON public.inventory_count_items TO service_role;

ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own company inventory count items"
  ON public.inventory_count_items FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER trg_inventory_count_items_updated_at
  BEFORE UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: abrir contagem com snapshot dos produtos rastreados
CREATE OR REPLACE FUNCTION public.open_inventory_count(
  _company_id uuid,
  _scope text DEFAULT 'all',
  _product_ids uuid[] DEFAULT NULL,
  _category text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_id uuid;
  v_scope_ref jsonb;
BEGIN
  IF NOT public.user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta empresa';
  END IF;

  v_scope_ref := CASE
    WHEN _scope = 'category' THEN jsonb_build_object('category', _category)
    WHEN _scope = 'custom' THEN jsonb_build_object('product_ids', to_jsonb(_product_ids))
    ELSE NULL
  END;

  INSERT INTO public.inventory_counts (company_id, status, scope, scope_ref, notes, opened_by)
  VALUES (_company_id, 'counting', _scope, v_scope_ref, _notes, auth.uid())
  RETURNING id INTO v_count_id;

  INSERT INTO public.inventory_count_items (count_id, company_id, product_id, expected_qty, unit_cost)
  SELECT
    v_count_id,
    _company_id,
    p.id,
    COALESCE(p.stock_quantity, 0),
    COALESCE(p.cost_price, 0)
  FROM public.products p
  WHERE p.company_id = _company_id
    AND COALESCE(p.track_stock, false) = true
    AND COALESCE(p.active, true) = true
    AND (
      _scope = 'all'
      OR (_scope = 'category' AND p.category = _category)
      OR (_scope = 'custom' AND p.id = ANY(_product_ids))
    );

  UPDATE public.inventory_counts
     SET total_items = (SELECT count(*) FROM public.inventory_count_items WHERE count_id = v_count_id)
   WHERE id = v_count_id;

  RETURN v_count_id;
END;
$$;

-- RPC: fechar contagem (gera ajustes em stock_movements)
CREATE OR REPLACE FUNCTION public.close_inventory_count(_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_item record;
  v_divergent int := 0;
  v_adjustment_value numeric := 0;
  v_delta numeric;
BEGIN
  SELECT company_id INTO v_company_id FROM public.inventory_counts WHERE id = _count_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Contagem não encontrada';
  END IF;
  IF NOT public.user_belongs_to_company(auth.uid(), v_company_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR v_item IN
    SELECT * FROM public.inventory_count_items
    WHERE count_id = _count_id AND approved = true AND final_qty IS NOT NULL
  LOOP
    v_delta := v_item.final_qty - v_item.expected_qty;
    IF v_delta <> 0 THEN
      PERFORM public.apply_stock_movement(
        v_item.product_id,
        v_delta,
        'adjustment',
        'inventory_count',
        _count_id,
        'Ajuste de inventário #' || substring(_count_id::text for 8)
      );
      v_divergent := v_divergent + 1;
      v_adjustment_value := v_adjustment_value + (v_delta * COALESCE(v_item.unit_cost, 0));
    END IF;
  END LOOP;

  UPDATE public.inventory_counts
     SET status = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         divergent_items = v_divergent,
         adjustment_value = v_adjustment_value
   WHERE id = _count_id;

  RETURN jsonb_build_object(
    'divergent_items', v_divergent,
    'adjustment_value', v_adjustment_value
  );
END;
$$;
