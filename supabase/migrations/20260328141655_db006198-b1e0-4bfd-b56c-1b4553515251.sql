CREATE POLICY "Payment methods viewable publicly for menu"
ON public.payment_methods
FOR SELECT
TO public
USING (active = true);