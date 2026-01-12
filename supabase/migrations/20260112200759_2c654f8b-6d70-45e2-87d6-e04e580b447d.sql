-- Atualizar a policy de UPDATE para permitir que qualquer usuário da empresa atualize
DROP POLICY IF EXISTS "Company admins can update their company" ON public.companies;

CREATE POLICY "Company users can update their company"
ON public.companies
FOR UPDATE
USING (user_belongs_to_company(auth.uid(), id))
WITH CHECK (user_belongs_to_company(auth.uid(), id));