CREATE POLICY "Company admins can manage own modules"
ON public.company_modules
FOR ALL
TO authenticated
USING (
  user_belongs_to_company(auth.uid(), company_id)
  AND has_role(auth.uid(), 'company_admin'::app_role)
)
WITH CHECK (
  user_belongs_to_company(auth.uid(), company_id)
  AND has_role(auth.uid(), 'company_admin'::app_role)
);