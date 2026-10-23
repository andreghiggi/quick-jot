-- Libera somente a Mesa 7 da Bon Appetit (ja cobrada). Nao gera venda, nao mexe em caixa nem fiscal.
DO $$
DECLARE
  _cid uuid := '32b71649-461d-4cb6-b26c-12390b090feb';
  _tbl_id uuid;
  _tab_rec RECORD;
BEGIN
  SELECT id INTO _tbl_id FROM public.tables WHERE company_id = _cid AND number = 7;
  IF _tbl_id IS NULL THEN RAISE NOTICE 'Mesa 7 nao encontrada'; RETURN; END IF;
  FOR _tab_rec IN SELECT id FROM public.tabs WHERE company_id = _cid AND table_id = _tbl_id AND status = 'open' LOOP
    IF to_regclass('public.tab_item_fraction_reservations') IS NOT NULL THEN
      UPDATE public.tab_item_fraction_reservations SET status = 'canceled'
       WHERE company_id = _cid AND source_tab_id = _tab_rec.id AND status IN ('reserved','expired');
    END IF;
    IF to_regclass('public.comanda_charges') IS NOT NULL THEN
      UPDATE public.comanda_charges SET status = 'canceled'
       WHERE company_id = _cid AND _tab_rec.id = ANY(tab_ids) AND status IN ('open','expired');
    END IF;
    UPDATE public.tabs SET status = 'closed', closed_at = now() WHERE id = _tab_rec.id;
  END LOOP;
  UPDATE public.tables SET status = 'available', updated_at = now() WHERE id = _tbl_id;
END $$;
