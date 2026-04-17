-- Adiciona coluna 'channel' para separar formas de pagamento por canal
ALTER TABLE public.payment_methods
ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'menu';

-- Garante valores válidos
ALTER TABLE public.payment_methods
DROP CONSTRAINT IF EXISTS payment_methods_channel_check;

ALTER TABLE public.payment_methods
ADD CONSTRAINT payment_methods_channel_check
CHECK (channel IN ('pdv', 'express', 'menu'));

-- Marca todas as formas existentes como sendo do Cardápio Online
UPDATE public.payment_methods SET channel = 'menu' WHERE channel IS NULL OR channel = '';

-- Índice para acelerar filtros por (company_id, channel)
CREATE INDEX IF NOT EXISTS idx_payment_methods_company_channel
ON public.payment_methods (company_id, channel);