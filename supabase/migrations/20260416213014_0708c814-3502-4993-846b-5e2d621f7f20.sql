CREATE POLICY "Public can insert print jobs for active companies"
ON public.print_queue
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies
    WHERE companies.id = print_queue.company_id
      AND companies.active = true
  )
);