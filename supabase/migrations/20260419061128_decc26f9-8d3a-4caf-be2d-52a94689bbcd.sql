-- Adiciona coluna origin na tabela orders para identificar a origem do pedido
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'cardapio';

-- Adiciona check constraint para validar valores permitidos
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_origin_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_origin_check 
CHECK (origin IN ('cardapio', 'balcao', 'mesa'));

-- Index para filtros rápidos por origem
CREATE INDEX IF NOT EXISTS idx_orders_origin ON public.orders(company_id, origin);