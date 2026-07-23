-- Retomada faturamento Asaas (Super Admin -> Revendedor)
-- 1. Limpa faturas antigas (modelo mudou de dono: agora é você cobrando o revendedor)
TRUNCATE public.reseller_invoice_items, public.reseller_invoices RESTART IDENTITY CASCADE;

-- 2. Chave Asaas agora é global do super admin (secret ASAAS_API_KEY), não por revendedor
ALTER TABLE public.reseller_settings DROP COLUMN IF EXISTS asaas_api_key;