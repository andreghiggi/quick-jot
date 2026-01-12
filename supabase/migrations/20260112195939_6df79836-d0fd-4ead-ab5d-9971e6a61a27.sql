-- Remover políticas públicas RESTRICTIVE existentes
DROP POLICY IF EXISTS "Products viewable publicly for menu" ON public.products;
DROP POLICY IF EXISTS "Categories viewable publicly" ON public.categories;
DROP POLICY IF EXISTS "Store settings viewable publicly" ON public.store_settings;
DROP POLICY IF EXISTS "Product optionals viewable publicly" ON public.product_optionals;

-- Criar política pública PERMISSIVE para companies (para o cardápio)
CREATE POLICY "Companies viewable publicly for menu"
ON public.companies
FOR SELECT
USING (active = true);

-- Criar políticas PERMISSIVE para products (cardápio público)
CREATE POLICY "Products viewable publicly for menu"
ON public.products
FOR SELECT
USING (active = true);

-- Criar políticas PERMISSIVE para categories (cardápio público)
CREATE POLICY "Categories viewable publicly for menu"
ON public.categories
FOR SELECT
USING (active = true);

-- Criar políticas PERMISSIVE para store_settings (cardápio público)
CREATE POLICY "Store settings viewable publicly for menu"
ON public.store_settings
FOR SELECT
USING (true);

-- Criar políticas PERMISSIVE para product_optionals (cardápio público)
CREATE POLICY "Product optionals viewable publicly for menu"
ON public.product_optionals
FOR SELECT
USING (active = true);