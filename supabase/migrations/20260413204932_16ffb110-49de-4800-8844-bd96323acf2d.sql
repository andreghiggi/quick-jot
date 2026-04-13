
-- Add user_id to resellers to link reseller to their auth account
ALTER TABLE public.resellers ADD COLUMN user_id uuid UNIQUE;

-- Helper function to get reseller_id from user
CREATE OR REPLACE FUNCTION public.get_reseller_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.resellers WHERE user_id = _user_id LIMIT 1
$$;

-- Reseller can view and update their own record
CREATE POLICY "Resellers can view own record"
  ON public.resellers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Resellers can update own record"
  ON public.resellers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Reseller can view own settings
CREATE POLICY "Resellers can view own settings"
  ON public.reseller_settings FOR SELECT TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()));

CREATE POLICY "Resellers can update own settings"
  ON public.reseller_settings FOR UPDATE TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()))
  WITH CHECK (reseller_id = get_reseller_id(auth.uid()));

-- Reseller can view own companies
CREATE POLICY "Resellers can view own companies"
  ON public.reseller_companies FOR SELECT TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()));

-- Reseller can insert companies for themselves
CREATE POLICY "Resellers can add companies"
  ON public.reseller_companies FOR INSERT TO authenticated
  WITH CHECK (reseller_id = get_reseller_id(auth.uid()));

-- Allow resellers to view companies they own
CREATE POLICY "Resellers can view their companies"
  ON public.companies FOR SELECT TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()));

-- Allow resellers to create companies
CREATE POLICY "Resellers can create companies"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (reseller_id = get_reseller_id(auth.uid()));

-- Allow resellers to update their companies
CREATE POLICY "Resellers can update their companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()));

-- Allow resellers to manage company_plans for their companies
CREATE POLICY "Resellers can view company plans"
  ON public.company_plans FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_plans.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ));

CREATE POLICY "Resellers can manage company plans"
  ON public.company_plans FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_plans.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_plans.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ));

-- Allow resellers to manage company_users for their companies  
CREATE POLICY "Resellers can manage company users"
  ON public.company_users FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_users.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_users.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ));

-- Allow resellers to manage company_modules for their companies
CREATE POLICY "Resellers can manage company modules"
  ON public.company_modules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_modules.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_modules.company_id
    AND c.reseller_id = get_reseller_id(auth.uid())
  ));
