-- Adicionar policy para permitir SELECT público de pedidos (para script de impressão)
-- O script usa anon key e precisa ler pedidos filtrados por company_id

CREATE POLICY "Orders viewable publicly by company_id" 
ON public.orders 
FOR SELECT 
USING (true);

-- Permitir UPDATE público para marcar pedidos como impressos
CREATE POLICY "Orders can be updated publicly for printing" 
ON public.orders 
FOR UPDATE 
USING (true);

-- Fazer o mesmo para order_items
CREATE POLICY "Order items viewable publicly" 
ON public.order_items 
FOR SELECT 
USING (true);