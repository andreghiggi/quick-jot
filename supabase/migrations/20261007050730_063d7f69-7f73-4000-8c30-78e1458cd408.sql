DO $$
DECLARE
  _cid uuid := '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
BEGIN
  UPDATE public.tab_item_fraction_reservations SET status = 'canceled'
   WHERE company_id = _cid AND status IN ('reserved','expired');
  UPDATE public.comanda_charges SET status = 'canceled'
   WHERE company_id = _cid AND status IN ('open','expired');
  UPDATE public.tabs SET status = 'closed', closed_at = now()
   WHERE company_id = _cid AND status = 'open';
  UPDATE public.tables SET status = 'available'
   WHERE company_id = _cid AND status <> 'available';
END $$;