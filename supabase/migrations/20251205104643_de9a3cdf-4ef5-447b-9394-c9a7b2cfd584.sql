-- Add DELETE policy for products table
CREATE POLICY "Products can be deleted by anyone"
ON public.products
FOR DELETE
USING (true);