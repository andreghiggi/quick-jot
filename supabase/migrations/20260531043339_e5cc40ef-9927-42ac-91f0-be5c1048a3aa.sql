ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_items jsonb,
  ADD COLUMN IF NOT EXISTS split_info jsonb,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

CREATE INDEX IF NOT EXISTS idx_orders_payment_status_company
  ON public.orders (company_id, payment_status)
  WHERE payment_status = 'partial';