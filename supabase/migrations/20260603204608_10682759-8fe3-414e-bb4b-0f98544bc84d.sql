-- ============= COUPONS TABLE =============
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  min_order_value numeric,
  max_discount numeric,
  free_shipping boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX coupons_company_code_unique ON public.coupons (company_id, upper(code));
CREATE INDEX coupons_company_active_idx ON public.coupons (company_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT SELECT ON public.coupons TO anon;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage their coupons"
  ON public.coupons FOR ALL
  TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Active coupons viewable publicly for menu"
  ON public.coupons FOR SELECT
  TO anon, authenticated
  USING (active = true);

CREATE TRIGGER coupons_set_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= ORDERS: optional coupon fields =============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_shipping_applied boolean NOT NULL DEFAULT false;