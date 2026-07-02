DROP POLICY IF EXISTS "Company users can view their pdv_settings" ON public.pdv_settings;
DROP POLICY IF EXISTS "Company users can insert their pdv_settings" ON public.pdv_settings;
DROP POLICY IF EXISTS "Company users can update their pdv_settings" ON public.pdv_settings;

CREATE POLICY "Company users and admins can view pdv_settings"
  ON public.pdv_settings
  FOR SELECT
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Company users and admins can insert pdv_settings"
  ON public.pdv_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Company users and admins can update pdv_settings"
  ON public.pdv_settings
  FOR UPDATE
  TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );