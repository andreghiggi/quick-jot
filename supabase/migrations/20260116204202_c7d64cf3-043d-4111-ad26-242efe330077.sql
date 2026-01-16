-- Allow company admins to manage waiter roles only
CREATE POLICY "Company admins can manage waiter roles"
ON public.user_roles
FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND role = 'waiter'::app_role
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND role = 'waiter'::app_role
);