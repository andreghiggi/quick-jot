
-- Restrict hard DELETE on orders to super_admin only
DROP POLICY IF EXISTS "Orders deleted by company users" ON public.orders;

CREATE POLICY "Orders deleted only by super admins"
ON public.orders
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add explicit DELETE policy for order_items (was previously covered by ALL policy)
-- Restrict to super_admin to keep parity with orders
DROP POLICY IF EXISTS "Order items deleted only by super admins" ON public.order_items;

CREATE POLICY "Order items deleted only by super admins"
ON public.order_items
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- The existing "Order items managed by company users" ALL policy still grants
-- INSERT/UPDATE/SELECT to company users; we override DELETE specifically.
-- Postgres applies the most permissive of overlapping policies for the same command,
-- so we must remove DELETE from the ALL policy by recreating it without DELETE.
DROP POLICY IF EXISTS "Order items managed by company users" ON public.order_items;

CREATE POLICY "Order items inserted by company users"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Order items updated by company users"
ON public.order_items
FOR UPDATE
TO authenticated
USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));
