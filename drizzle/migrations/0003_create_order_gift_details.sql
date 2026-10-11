CREATE TABLE public.order_gift_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_gift boolean NOT NULL DEFAULT true,
  recipient_name text,
  recipient_phone text,
  allow_notify_recipient boolean NOT NULL DEFAULT false,
  card_included boolean NOT NULL DEFAULT true,
  card_message text,
  occasion text,
  scheduled_date date,
  scheduled_slot text,
  special_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ogd_card_len CHECK (card_message IS NULL OR char_length(card_message) <= 500),
  CONSTRAINT ogd_name_len CHECK (recipient_name IS NULL OR char_length(recipient_name) BETWEEN 2 AND 120),
  CONSTRAINT ogd_phone_fmt CHECK (recipient_phone IS NULL OR recipient_phone ~ '^[0-9]{10,11}$'),
  CONSTRAINT ogd_gift_required CHECK (NOT is_gift OR (recipient_name IS NOT NULL AND recipient_phone IS NOT NULL))
);

CREATE INDEX idx_ogd_company_date ON public.order_gift_details(company_id, scheduled_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_gift_details TO authenticated;
GRANT INSERT ON public.order_gift_details TO anon;
GRANT ALL ON public.order_gift_details TO service_role;

ALTER TABLE public.order_gift_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage gift details"
ON public.order_gift_details FOR ALL TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Public checkout inserts gift details for florists"
ON public.order_gift_details FOR INSERT TO anon, authenticated
WITH CHECK (
  public.is_company_module_enabled(company_id, 'floricultura')
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = order_gift_details.company_id AND o.created_at > now() - interval '10 minutes')
);

CREATE TRIGGER trg_ogd_updated_at BEFORE UPDATE ON public.order_gift_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();