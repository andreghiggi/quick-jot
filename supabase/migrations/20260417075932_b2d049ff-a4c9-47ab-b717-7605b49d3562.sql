-- 1) Tables
CREATE TABLE public.sales_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Atualização de Cardápio',
  message_a text NOT NULL,
  message_b text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | running | paused | completed | canceled
  total_recipients int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  sent_today int NOT NULL DEFAULT 0,
  sent_today_date date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX idx_sales_campaigns_company ON public.sales_campaigns(company_id);
CREATE INDEX idx_sales_campaigns_status ON public.sales_campaigns(status);

CREATE TABLE public.sales_campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  variation text, -- 'A' | 'B'
  message_text text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_messages_campaign ON public.sales_campaign_messages(campaign_id);
CREATE INDEX idx_campaign_messages_status ON public.sales_campaign_messages(campaign_id, status);

CREATE TABLE public.campaign_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interval_seconds int NOT NULL DEFAULT 60,
  max_per_day int NOT NULL DEFAULT 100,
  start_hour int NOT NULL DEFAULT 8,
  end_hour int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.campaign_settings (interval_seconds, max_per_day, start_hour, end_hour)
VALUES (60, 100, 8, 20);

-- 2) updated_at triggers
CREATE TRIGGER trg_sales_campaigns_updated
BEFORE UPDATE ON public.sales_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_campaign_settings_updated
BEFORE UPDATE ON public.campaign_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RLS
ALTER TABLE public.sales_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage campaigns"
ON public.sales_campaigns FOR ALL TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role manages campaigns"
ON public.sales_campaigns FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Company users view campaign messages"
ON public.sales_campaign_messages FOR SELECT TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company users insert campaign messages"
ON public.sales_campaign_messages FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role manages campaign messages"
ON public.sales_campaign_messages FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "All authenticated read campaign settings"
ON public.campaign_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Super admin manages campaign settings"
ON public.campaign_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role reads campaign settings"
ON public.campaign_settings FOR SELECT TO service_role
USING (true);

-- 4) Habilitar módulo para Lancheria da I9
INSERT INTO public.company_modules (company_id, module_name, enabled)
VALUES ('8c9e7a0e-dbb6-49b9-8344-c23155a71164', 'sales_campaigns', true)
ON CONFLICT DO NOTHING;

-- 5) pg_cron + pg_net já habilitados? garante extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;