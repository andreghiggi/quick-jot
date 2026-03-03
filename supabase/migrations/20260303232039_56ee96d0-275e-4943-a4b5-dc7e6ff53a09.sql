CREATE TABLE public.whatsapp_auto_reply_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, phone)
);
ALTER TABLE public.whatsapp_auto_reply_locks ENABLE ROW LEVEL SECURITY;