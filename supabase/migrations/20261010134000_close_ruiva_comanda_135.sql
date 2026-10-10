-- Fecha somente a comanda 135 ("Comanda 001") aberta da Cozinha da Ruiva.
-- Nao gera venda, nao mexe em caixa nem fiscal.
DO $$
DECLARE
  _cid uuid := '55181771-8b10-4af1-afc3-472c090a49be';
  _tab_id uuid;
  _tbl_id uuid;
  _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.tabs
   WHERE company_id = _cid AND status = 'open' AND tab_number = 135;
  IF _n <> 1 THEN
    RAISE NOTICE 'Comanda 135 aberta encontrada % vezes; nada alterado.', _n;
    RETURN;
  END IF;

  SELECT id, table_id INTO _tab_id, _tbl_id FROM public.tabs
   WHERE company_id = _cid AND status = 'open' AND tab_number = 135;

  IF to_regclass('public.tab_item_fraction_reservations') IS NOT NULL THEN
    UPDATE public.tab_item_fraction_reservations SET status = 'canceled'
     WHERE company_id = _cid AND tab_id = _tab_id AND status IN ('reserved','expired');
  END IF;
  IF to_regclass('public.comanda_charges') IS NOT NULL THEN
    UPDATE public.comanda_charges SET status = 'canceled'
     WHERE company_id = _cid AND tab_id = _tab_id AND status IN ('open','expired');
  END IF;

  UPDATE public.tabs SET status = 'closed', closed_at = now() WHERE id = _tab_id;

  IF _tbl_id IS NOT NULL THEN
    UPDATE public.tables t SET status = 'available'
     WHERE t.id = _tbl_id
       AND NOT EXISTS (SELECT 1 FROM public.tabs x WHERE x.table_id = t.id AND x.status = 'open');
  END IF;
END $$;
