UPDATE public.print_queue SET printed = true WHERE company_id = 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8' AND printed = false;
CREATE POLICY "Anon can delete print queue" ON public.print_queue FOR DELETE TO anon USING (true);
GRANT DELETE ON public.print_queue TO anon;