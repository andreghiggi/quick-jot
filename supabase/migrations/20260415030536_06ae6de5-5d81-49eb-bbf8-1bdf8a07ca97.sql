
-- Fix argument order in print_queue RLS policies
DROP POLICY "Users can insert print jobs for their company" ON public.print_queue;
CREATE POLICY "Users can insert print jobs for their company"
ON public.print_queue FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY "Users can read their company print jobs" ON public.print_queue;
CREATE POLICY "Users can read their company print jobs"
ON public.print_queue FOR SELECT TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));
