
-- Create reseller_invoices table
CREATE TABLE public.reseller_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  month text NOT NULL, -- format: '2026-04'
  due_date date NOT NULL,
  total_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending, paid, overdue
  paid_at timestamp with time zone,
  payment_method text, -- boleto, pix, etc.
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, month)
);

ALTER TABLE public.reseller_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers can view own invoices"
  ON public.reseller_invoices FOR SELECT TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()));

CREATE POLICY "Resellers can update own invoices"
  ON public.reseller_invoices FOR UPDATE TO authenticated
  USING (reseller_id = get_reseller_id(auth.uid()))
  WITH CHECK (reseller_id = get_reseller_id(auth.uid()));

CREATE POLICY "Super admins can manage all invoices"
  ON public.reseller_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Create reseller_invoice_items table
CREATE TABLE public.reseller_invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.reseller_invoices(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  type text NOT NULL, -- 'activation', 'monthly', 'prorated'
  value numeric NOT NULL DEFAULT 0,
  days_counted integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers can view own invoice items"
  ON public.reseller_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reseller_invoices i
    WHERE i.id = reseller_invoice_items.invoice_id
    AND i.reseller_id = get_reseller_id(auth.uid())
  ));

CREATE POLICY "Super admins can manage all invoice items"
  ON public.reseller_invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_reseller_invoices_updated_at
  BEFORE UPDATE ON public.reseller_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
