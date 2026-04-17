DELETE FROM public.reseller_invoice_items
WHERE invoice_id IN (
  SELECT i.id FROM public.reseller_invoices i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.status IN ('pending','overdue') AND c.active = true
);

DELETE FROM public.reseller_invoices i
USING public.companies c
WHERE c.id = i.company_id
  AND i.status IN ('pending','overdue')
  AND c.active = true;