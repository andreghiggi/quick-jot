-- Floricultura (Etapas 1 e 2) + ativação da Terra Viva Floricultura — banco da VPS.
-- Idempotente: pode rodar mais de uma vez sem erro. Não altera restaurantes.

-- 1) Função pública: só revela o módulo 'floricultura'
CREATE OR REPLACE FUNCTION public.is_company_module_enabled(_company_id uuid, _module_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _module_name <> 'floricultura' THEN false ELSE COALESCE((
    SELECT enabled FROM public.company_modules
    WHERE company_id = _company_id AND module_name = 'floricultura' LIMIT 1), false) END
$$;
REVOKE ALL ON FUNCTION public.is_company_module_enabled(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_module_enabled(uuid, text) TO anon, authenticated, service_role;

-- 2) Tabela de detalhes do presente
CREATE TABLE IF NOT EXISTS public.order_gift_details (
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

CREATE INDEX IF NOT EXISTS idx_ogd_company_date ON public.order_gift_details(company_id, scheduled_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_gift_details TO authenticated;
GRANT INSERT ON public.order_gift_details TO anon;
GRANT ALL ON public.order_gift_details TO service_role;

ALTER TABLE public.order_gift_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members manage gift details" ON public.order_gift_details;
CREATE POLICY "Company members manage gift details"
ON public.order_gift_details FOR ALL TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Public checkout inserts gift details for florists" ON public.order_gift_details;
CREATE POLICY "Public checkout inserts gift details for florists"
ON public.order_gift_details FOR INSERT TO anon, authenticated
WITH CHECK (
  public.is_company_module_enabled(company_id, 'floricultura')
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = order_gift_details.company_id AND o.created_at > now() - interval '10 minutes')
);

DROP TRIGGER IF EXISTS trg_ogd_updated_at ON public.order_gift_details;
CREATE TRIGGER trg_ogd_updated_at BEFORE UPDATE ON public.order_gift_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Ativa o perfil floricultura SOMENTE na Terra Viva Floricultura
UPDATE public.company_modules SET enabled = true
WHERE company_id = '9eeab15c-47d5-41cd-9c69-1620878b1f4f' AND module_name = 'floricultura';

INSERT INTO public.company_modules (company_id, module_name, enabled)
SELECT '9eeab15c-47d5-41cd-9c69-1620878b1f4f', 'floricultura', true
WHERE EXISTS (SELECT 1 FROM public.companies WHERE id = '9eeab15c-47d5-41cd-9c69-1620878b1f4f')
  AND NOT EXISTS (
    SELECT 1 FROM public.company_modules
    WHERE company_id = '9eeab15c-47d5-41cd-9c69-1620878b1f4f' AND module_name = 'floricultura'
  );

NOTIFY pgrst, 'reload schema';
