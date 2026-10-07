DO $$
DECLARE
  _cid uuid := '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
BEGIN
  IF to_regclass('public.tab_item_fraction_reservations') IS NOT NULL THEN
    UPDATE public.tab_item_fraction_reservations
       SET status = 'canceled'
     WHERE company_id = _cid AND status IN ('reserved','expired');
  END IF;

  IF to_regclass('public.comanda_charges') IS NOT NULL THEN
    UPDATE public.comanda_charges
       SET status = 'canceled'
     WHERE company_id = _cid AND status IN ('open','expired');
  END IF;

  UPDATE public.tabs
     SET status = 'closed', closed_at = now()
   WHERE company_id = _cid AND status = 'open';

  UPDATE public.tables
     SET status = 'available'
   WHERE company_id = _cid AND status <> 'available';
END $$;