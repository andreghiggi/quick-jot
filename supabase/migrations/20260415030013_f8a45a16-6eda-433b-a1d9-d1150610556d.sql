
-- Print queue for waiter mobile → computer printer
CREATE TABLE public.print_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  html_content TEXT NOT NULL,
  label TEXT,
  printed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at TIMESTAMPTZ
);

ALTER TABLE public.print_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert for their company
CREATE POLICY "Users can insert print jobs for their company"
ON public.print_queue FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_company(company_id, auth.uid()));

-- Anon can read and update (for auto_printer.py script)
CREATE POLICY "Anon can read print queue"
ON public.print_queue FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can update print queue"
ON public.print_queue FOR UPDATE TO anon USING (true);

-- Authenticated can also read their company jobs
CREATE POLICY "Users can read their company print jobs"
ON public.print_queue FOR SELECT TO authenticated
USING (public.user_belongs_to_company(company_id, auth.uid()));

CREATE INDEX idx_print_queue_pending ON public.print_queue(company_id, printed) WHERE NOT printed;
