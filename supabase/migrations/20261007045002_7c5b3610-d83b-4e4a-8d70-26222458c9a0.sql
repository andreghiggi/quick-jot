CREATE OR REPLACE FUNCTION public.finalize_comanda_charge(_charge_id uuid, _sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record; r record; it record; v_target uuid; v_used40 int;
  v_new_total numeric; v_new_qty numeric; v_tbl uuid;
BEGIN
  SELECT * INTO c FROM public.comanda_charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança não encontrada'; END IF;
  PERFORM public._comanda_guard(c.company_id);
  IF c.status = 'finalized' THEN
    RETURN jsonb_build_object('already', true, 'sale_id', c.sale_id);
  END IF;
  IF c.status NOT IN ('open','expired') THEN
    RAISE EXCEPTION 'Cobrança cancelada — não pode ser finalizada';
  END IF;

  v_target := c.tab_ids[1];

  FOR r IN SELECT * FROM public.tab_item_fraction_reservations
            WHERE charge_id = _charge_id AND status IN ('reserved','expired')
            ORDER BY created_at
  LOOP
    SELECT * INTO it FROM public.tab_items WHERE id = r.source_tab_item_id FOR UPDATE;
    IF NOT FOUND OR COALESCE(it.paid,false) THEN
      RAISE EXCEPTION 'Item de origem mudou durante a cobrança';
    END IF;
    IF r.status = 'expired' THEN
      SELECT COALESCE(sum(fraction_num * (40 / fraction_den)),0) INTO v_used40
        FROM public.tab_item_fraction_reservations
       WHERE source_tab_item_id = r.source_tab_item_id AND status IN ('reserved','confirmed') AND id <> r.id;
      IF v_used40 + r.fraction_num * (40 / r.fraction_den) > 40 THEN
        RAISE EXCEPTION 'Fração expirada foi usada por outra cobrança';
      END IF;
    END IF;
    v_new_total := round(it.total_price - r.amount_cents / 100.0, 2);
    v_new_qty := round(it.quantity - r.quantity, 3);
    IF v_new_total <= 0.004 THEN
      UPDATE public.tab_items SET total_price = 0, quantity = 0, paid = true WHERE id = it.id;
    ELSE
      UPDATE public.tab_items
         SET total_price = v_new_total,
             quantity = GREATEST(v_new_qty, 0.001),
             unit_price = round(v_new_total / GREATEST(v_new_qty, 0.001), 2)
       WHERE id = it.id;
    END IF;
    INSERT INTO public.tab_items
      (tab_id, product_id, product_name, quantity, unit_price, total_price, notes, created_by, paid,
       source_tab_item_id, fraction_num, fraction_den, amount_cents)
    VALUES
      (v_target, it.product_id, it.product_name, r.quantity,
       round((r.amount_cents / 100.0) / r.quantity, 2), r.amount_cents / 100.0,
       'Fração ' || r.fraction_num || '/' || r.fraction_den || ' importada',
       COALESCE(auth.uid(), it.created_by), true,
       it.id, r.fraction_num, r.fraction_den, r.amount_cents);
    UPDATE public.tab_item_fraction_reservations SET status = 'confirmed' WHERE id = r.id;
  END LOOP;

  UPDATE public.tab_items SET paid = true WHERE tab_id = ANY(c.tab_ids) AND COALESCE(paid,false) = false;
  UPDATE public.tabs SET status = 'closed', closed_at = now() WHERE id = ANY(c.tab_ids);

  FOR v_tbl IN SELECT DISTINCT table_id FROM public.tabs WHERE id = ANY(c.tab_ids) AND table_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.tabs WHERE table_id = v_tbl AND status = 'open') THEN
      UPDATE public.tables SET status = 'available' WHERE id = v_tbl;
    END IF;
  END LOOP;

  UPDATE public.comanda_charges SET status = 'finalized', sale_id = _sale_id, finalized_at = now()
   WHERE id = _charge_id;
  RETURN jsonb_build_object('already', false, 'sale_id', _sale_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.finalize_comanda_charge(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_comanda_charge(uuid, uuid) TO authenticated, service_role;