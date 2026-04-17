-- Add Asaas fields to reseller_invoices (admin master cobra revendedor por loja)
ALTER TABLE public.reseller_invoices
  ADD COLUMN IF NOT EXISTS asaas_charge_id text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text,
  ADD COLUMN IF NOT EXISTS asaas_pix_qrcode text,
  ADD COLUMN IF NOT EXISTS asaas_pix_payload text,
  ADD COLUMN IF NOT EXISTS asaas_boleto_url text,
  ADD COLUMN IF NOT EXISTS asaas_status text,
  ADD COLUMN IF NOT EXISTS asaas_env text;

CREATE INDEX IF NOT EXISTS idx_reseller_invoices_asaas_charge_id ON public.reseller_invoices(asaas_charge_id);

-- Add Asaas customer mapping for resellers (one customer per reseller in Asaas)
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- Add asaas_env to admin_settings so super_admin controls sandbox/prod
ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS asaas_env text DEFAULT 'sandbox';