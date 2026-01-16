-- Adicionar role 'waiter' ao enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'waiter';

-- Criar tabela de garçons para dados adicionais
CREATE TABLE public.waiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.waiters ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage all waiters"
  ON public.waiters FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage company waiters"
  ON public.waiters FOR ALL
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'company_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_role(auth.uid(), 'company_admin')
  );

CREATE POLICY "Waiters can view themselves"
  ON public.waiters FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Atualizar função has_role para incluir 'waiter'
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Trigger para updated_at
CREATE TRIGGER update_waiters_updated_at
  BEFORE UPDATE ON public.waiters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();