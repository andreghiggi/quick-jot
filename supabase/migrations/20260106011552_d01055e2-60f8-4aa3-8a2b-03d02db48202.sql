-- Enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('super_admin', 'company_admin', 'company_user');

-- Tabela de empresas (tenants)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  phone TEXT,
  address TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de roles (separada por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'company_user',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Tabela de relação usuário-empresa
CREATE TABLE public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_owner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, user_id)
);

-- Adicionar company_id nas tabelas existentes
ALTER TABLE public.products ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.product_optionals ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.store_settings ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Habilitar RLS em todas as novas tabelas
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

-- Função para verificar se usuário tem role específica
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para verificar se usuário pertence à empresa
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Função para obter empresa do usuário
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_users
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Trigger para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Por padrão, novo usuário é company_user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'company_user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para atualizar updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies para companies
CREATE POLICY "Super admins can manage all companies"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company users can view their company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), id));

CREATE POLICY "Company admins can update their company"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), id) 
    AND (
      public.has_role(auth.uid(), 'company_admin') 
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

-- RLS Policies para profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies para user_roles
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies para company_users
CREATE POLICY "Super admins can manage all company users"
  ON public.company_users FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage company users"
  ON public.company_users FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'company_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'company_admin')
  );

CREATE POLICY "Users can view own company membership"
  ON public.company_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Atualizar policies das tabelas existentes para filtrar por company_id
-- Products
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Products can be inserted by anyone" ON public.products;
DROP POLICY IF EXISTS "Products can be updated by anyone" ON public.products;
DROP POLICY IF EXISTS "Products can be deleted by anyone" ON public.products;

CREATE POLICY "Products viewable by company users"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL 
    OR public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Products viewable publicly for menu"
  ON public.products FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY "Products managed by company users"
  ON public.products FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Categories
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Categories can be created by anyone" ON public.categories;
DROP POLICY IF EXISTS "Categories can be updated by anyone" ON public.categories;
DROP POLICY IF EXISTS "Categories can be deleted by anyone" ON public.categories;

CREATE POLICY "Categories viewable by company users"
  ON public.categories FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL 
    OR public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Categories viewable publicly"
  ON public.categories FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY "Categories managed by company users"
  ON public.categories FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Orders
DROP POLICY IF EXISTS "Orders are viewable by everyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be created by anyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be updated by anyone" ON public.orders;
DROP POLICY IF EXISTS "Orders can be deleted by anyone" ON public.orders;

CREATE POLICY "Orders viewable by company users"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL 
    OR public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Orders can be created publicly"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Orders managed by company users"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Orders deleted by company users"
  ON public.orders FOR DELETE
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Order Items
DROP POLICY IF EXISTS "Order items are viewable by everyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items can be created by anyone" ON public.order_items;
DROP POLICY IF EXISTS "Order items can be deleted by anyone" ON public.order_items;

CREATE POLICY "Order items viewable by company users"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL 
    OR public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Order items can be created publicly"
  ON public.order_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Order items managed by company users"
  ON public.order_items FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Product Optionals
DROP POLICY IF EXISTS "Product optionals are viewable by everyone" ON public.product_optionals;
DROP POLICY IF EXISTS "Product optionals can be created by anyone" ON public.product_optionals;
DROP POLICY IF EXISTS "Product optionals can be updated by anyone" ON public.product_optionals;
DROP POLICY IF EXISTS "Product optionals can be deleted by anyone" ON public.product_optionals;

CREATE POLICY "Product optionals viewable by company users"
  ON public.product_optionals FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL 
    OR public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Product optionals viewable publicly"
  ON public.product_optionals FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY "Product optionals managed by company users"
  ON public.product_optionals FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Store Settings
DROP POLICY IF EXISTS "Store settings are viewable by everyone" ON public.store_settings;
DROP POLICY IF EXISTS "Store settings can be created by anyone" ON public.store_settings;
DROP POLICY IF EXISTS "Store settings can be updated by anyone" ON public.store_settings;

CREATE POLICY "Store settings viewable by company users"
  ON public.store_settings FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL 
    OR public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Store settings viewable publicly"
  ON public.store_settings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Store settings managed by company users"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );