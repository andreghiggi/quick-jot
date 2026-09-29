
ALTER TABLE public.tabs ADD COLUMN IF NOT EXISTS comanda_number integer;
CREATE UNIQUE INDEX IF NOT EXISTS tabs_open_comanda_number_uniq
  ON public.tabs(company_id, comanda_number)
  WHERE status = 'open' AND comanda_number IS NOT NULL;

ALTER TABLE public.tab_items
  ADD COLUMN IF NOT EXISTS source_tab_item_id uuid,
  ADD COLUMN IF NOT EXISTS fraction_num integer,
  ADD COLUMN IF NOT EXISTS fraction_den integer,
  ADD COLUMN IF NOT EXISTS amount_cents bigint,
  ADD COLUMN IF NOT EXISTS original_total_cents bigint,
  ADD COLUMN IF NOT EXISTS original_quantity numeric(10,3);

-- Lista de lojas liberadas
CREATE TABLE public.comanda_cards_allowed_companies (
  company_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comanda_cards_allowed_companies TO authenticated;
GRANT ALL ON public.comanda_cards_allowed_companies TO service_role;
ALTER TABLE public.comanda_cards_allowed_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own allow entry" ON public.comanda_cards_allowed_companies
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin manages allow list" ON public.comanda_cards_allowed_companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
INSERT INTO public.comanda_cards_allowed_companies(company_id)
  VALUES ('8c9e7a0e-dbb6-49b9-8344-c23155a71164') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.comanda_cards_allowed(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.comanda_cards_allowed_companies WHERE company_id = _company_id)
$$;

CREATE OR REPLACE FUNCTION public.comanda_cards_active(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.comanda_cards_allowed(_company_id) AND EXISTS (
    SELECT 1 FROM public.store_settings
    WHERE company_id = _company_id AND key = 'comanda_cards_enabled' AND value = 'true')
$$;

CREATE OR REPLACE FUNCTION public.guard_comanda_cards_setting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.key = 'comanda_cards_enabled' AND NEW.value = 'true'
     AND NOT public.comanda_cards_allowed(NEW.company_id) THEN
    RAISE EXCEPTION 'Comanda individual não habilitada para esta loja';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_comanda_cards_setting
  BEFORE INSERT OR UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_comanda_cards_setting();

-- Cobranças
CREATE TABLE public.comanda_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tab_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'open',
  sale_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  finalized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comanda_charges TO authenticated;
GRANT ALL ON public.comanda_charges TO service_role;
ALTER TABLE public.comanda_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users view charges" ON public.comanda_charges
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_comanda_charges_updated BEFORE UPDATE ON public.comanda_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tab_item_fraction_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  charge_id uuid NOT NULL REFERENCES public.comanda_charges(id) ON DELETE CASCADE,
  source_tab_item_id uuid NOT NULL,
  source_tab_id uuid NOT NULL,
  fraction_num integer NOT NULL,
  fraction_den integer NOT NULL,
  amount_cents bigint NOT NULL,
  quantity numeric(10,3) NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tifr_source ON public.tab_item_fraction_reservations(source_tab_item_id);
CREATE INDEX idx_tifr_charge ON public.tab_item_fraction_reservations(charge_id);
GRANT SELECT ON public.tab_item_fraction_reservations TO authenticated;
GRANT ALL ON public.tab_item_fraction_reservations TO service_role;
ALTER TABLE public.tab_item_fraction_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users view reservations" ON public.tab_item_fraction_reservations
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_tifr_updated BEFORE UPDATE ON public.tab_item_fraction_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pedidos do QR pendentes de confirmação
CREATE TABLE public.comanda_pending_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  table_id uuid,
  table_number integer,
  comanda_number integer,
  reason text,
  items jsonb NOT NULL,
  production_ticket_html text,
  status text NOT NULL DEFAULT 'pending',
  resolved_tab_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.comanda_pending_orders TO authenticated;
GRANT ALL ON public.comanda_pending_orders TO service_role;
ALTER TABLE public.comanda_pending_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users view pending" ON public.comanda_pending_orders
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Company users resolve pending" ON public.comanda_pending_orders
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.comanda_cards_active(company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.comanda_cards_active(company_id));
CREATE TRIGGER trg_cpo_updated BEFORE UPDATE ON public.comanda_pending_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers
CREATE OR REPLACE FUNCTION public._comanda_guard(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.comanda_cards_active(_company_id) THEN
    RAISE EXCEPTION 'Comanda individual não habilitada para esta loja';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta empresa';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.expire_comanda_charges()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.comanda_charges SET status = 'expired'
   WHERE status = 'open' AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.tab_item_fraction_reservations r SET status = 'expired'
    FROM public.comanda_charges c
   WHERE r.charge_id = c.id AND c.status = 'expired' AND r.status = 'reserved';
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.create_comanda_charge(_company_id uuid, _tab_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_cnt int;
BEGIN
  PERFORM public._comanda_guard(_company_id);
  PERFORM public.expire_comanda_charges();
  IF _tab_ids IS NULL OR array_length(_tab_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma comanda selecionada';
  END IF;
  PERFORM 1 FROM public.tabs WHERE id = ANY(_tab_ids) FOR UPDATE;
  SELECT count(*) INTO v_cnt FROM public.tabs
   WHERE id = ANY(_tab_ids) AND company_id = _company_id AND status = 'open';
  IF v_cnt <> array_length(_tab_ids,1) THEN
    RAISE EXCEPTION 'Alguma comanda já foi fechada ou não pertence à loja';
  END IF;
  IF EXISTS (SELECT 1 FROM public.comanda_charges
              WHERE company_id = _company_id AND status = 'open' AND tab_ids && _tab_ids) THEN
    RAISE EXCEPTION 'Alguma comanda já está sendo cobrada em outro caixa';
  END IF;
  INSERT INTO public.comanda_charges(company_id, tab_ids, created_by)
  VALUES (_company_id, _tab_ids, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Capacidade em 40 avos (mmc de 2,4,5,8,10)
CREATE OR REPLACE FUNCTION public.reserve_tab_fraction(_charge_id uuid, _source_item_id uuid, _num int, _den int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record; it record; t record;
  v_used40 int; v_new40 int; v_orig_cents bigint; v_orig_qty numeric;
  v_used_cents bigint; v_amount bigint; v_qty numeric; v_id uuid;
BEGIN
  SELECT * INTO c FROM public.comanda_charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança não encontrada'; END IF;
  PERFORM public._comanda_guard(c.company_id);
  IF c.status <> 'open' THEN RAISE EXCEPTION 'Cobrança não está mais aberta'; END IF;
  IF _den NOT IN (2,4,5,8,10) OR _num < 1 OR _num >= _den THEN
    RAISE EXCEPTION 'Fração não permitida no piloto (use 1/2, 1/4, 1/5, 1/8 ou 1/10)';
  END IF;

  SELECT * INTO it FROM public.tab_items WHERE id = _source_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF COALESCE(it.paid,false) THEN RAISE EXCEPTION 'Item já foi pago'; END IF;
  SELECT * INTO t FROM public.tabs WHERE id = it.tab_id;
  IF t.company_id <> c.company_id OR t.status <> 'open' THEN
    RAISE EXCEPTION 'Comanda de origem não está aberta';
  END IF;
  IF t.id = ANY(c.tab_ids) THEN
    RAISE EXCEPTION 'Este item já está numa comanda desta cobrança';
  END IF;
  IF EXISTS (SELECT 1 FROM public.comanda_charges
              WHERE status = 'open' AND id <> _charge_id AND t.id = ANY(tab_ids)) THEN
    RAISE EXCEPTION 'A comanda de origem está sendo cobrada em outro caixa';
  END IF;

  PERFORM public.expire_comanda_charges();

  v_orig_cents := COALESCE(it.original_total_cents, round(it.total_price * 100)::bigint);
  v_orig_qty := COALESCE(it.original_quantity, it.quantity);

  SELECT COALESCE(sum(fraction_num * (40 / fraction_den)),0), COALESCE(sum(amount_cents),0)
    INTO v_used40, v_used_cents
    FROM public.tab_item_fraction_reservations
   WHERE source_tab_item_id = _source_item_id AND status IN ('reserved','confirmed');
  v_new40 := _num * (40 / _den);
  IF v_used40 + v_new40 > 40 THEN
    RAISE EXCEPTION 'Não há parte suficiente deste item para importar';
  END IF;
  IF v_used40 + v_new40 = 40 THEN
    v_amount := v_orig_cents - v_used_cents;
  ELSE
    v_amount := floor(v_orig_cents::numeric * _num / _den)::bigint;
  END IF;
  v_qty := round(v_orig_qty * _num / _den, 3);

  UPDATE public.tab_items
     SET original_total_cents = v_orig_cents, original_quantity = v_orig_qty
   WHERE id = _source_item_id AND original_total_cents IS NULL;

  INSERT INTO public.tab_item_fraction_reservations
    (company_id, charge_id, source_tab_item_id, source_tab_id, fraction_num, fraction_den, amount_cents, quantity)
  VALUES (c.company_id, _charge_id, _source_item_id, t.id, _num, _den, v_amount, v_qty)
  RETURNING id INTO v_id;

  UPDATE public.comanda_charges SET expires_at = now() + interval '15 minutes' WHERE id = _charge_id;

  RETURN jsonb_build_object('id', v_id, 'amount_cents', v_amount, 'quantity', v_qty,
    'product_id', it.product_id, 'product_name', it.product_name,
    'source_comanda', COALESCE(t.comanda_number, t.tab_number));
END $$;

CREATE OR REPLACE FUNCTION public.cancel_fraction_reservation(_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.tab_item_fraction_reservations WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public._comanda_guard(r.company_id);
  IF r.status = 'reserved' THEN
    UPDATE public.tab_item_fraction_reservations SET status = 'canceled' WHERE id = _reservation_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_comanda_charge(_charge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.comanda_charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public._comanda_guard(c.company_id);
  IF c.status IN ('open','expired') THEN
    UPDATE public.comanda_charges SET status = 'canceled' WHERE id = _charge_id;
    UPDATE public.tab_item_fraction_reservations SET status = 'canceled'
     WHERE charge_id = _charge_id AND status IN ('reserved','expired');
  END IF;
END $$;

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

  IF _sale_id IS NOT NULL THEN
    UPDATE public.pdv_sales SET imported_order_id = v_target WHERE id = _sale_id AND imported_order_id IS NULL;
  END IF;

  UPDATE public.comanda_charges SET status = 'finalized', sale_id = _sale_id, finalized_at = now()
   WHERE id = _charge_id;
  RETURN jsonb_build_object('already', false, 'sale_id', _sale_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.create_comanda_charge(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_tab_fraction(uuid, uuid, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_fraction_reservation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_comanda_charge(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_comanda_charge(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_comanda_charges() FROM anon;
REVOKE EXECUTE ON FUNCTION public._comanda_guard(uuid) FROM anon;
