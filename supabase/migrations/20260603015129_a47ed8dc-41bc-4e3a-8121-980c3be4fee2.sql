-- Fase 3: Controle de estoque para o módulo Mercado
-- Colunas opcionais em products (default desligado = zero impacto em lojas existentes)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0;

-- Tabela de histórico de movimentos
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  product_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('sale','manual_in','manual_out','adjustment','initial')),
  quantity numeric NOT NULL,
  balance_after numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock movements managed by company users"
ON public.stock_movements
FOR ALL
TO authenticated
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_product_created
  ON public.stock_movements (company_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON public.stock_movements (reference_type, reference_id);

-- Função para aplicar movimento (no-op se produto não tem track_stock)
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  _product_id uuid,
  _qty numeric,
  _type text,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_track boolean;
  v_new_balance numeric;
BEGIN
  SELECT company_id, track_stock INTO v_company_id, v_track
  FROM public.products WHERE id = _product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado', _product_id;
  END IF;

  IF NOT COALESCE(v_track, false) THEN
    RETURN NULL; -- no-op: produto não rastreia estoque
  END IF;

  UPDATE public.products
    SET stock_quantity = stock_quantity + _qty,
        updated_at = now()
    WHERE id = _product_id
    RETURNING stock_quantity INTO v_new_balance;

  INSERT INTO public.stock_movements
    (company_id, product_id, type, quantity, balance_after, reference_type, reference_id, notes, created_by)
  VALUES
    (v_company_id, _product_id, _type, _qty, v_new_balance, _reference_type, _reference_id, _notes, auth.uid());

  RETURN v_new_balance;
END;
$$;