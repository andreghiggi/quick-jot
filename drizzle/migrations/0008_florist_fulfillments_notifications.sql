-- Additive; no historical orders, templates, payments or fiscal records are changed.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS florist_fulfillments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS florist_items_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.florist_can_manage(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (
   public.user_belongs_to_company(auth.uid(),_company)
   OR public.has_role(auth.uid(),'super_admin')
   OR EXISTS (SELECT 1 FROM public.companies WHERE id=_company AND reseller_id=public.get_reseller_id(auth.uid()))
 );
$$;
REVOKE ALL ON FUNCTION public.florist_can_manage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.florist_can_manage(uuid) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.florist_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 stage_id text NOT NULL DEFAULT '',
 event text NOT NULL CHECK (event IN ('received','confirmed','ready_for_pickup','out_for_delivery','delivered','completed')),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','accepted','failed','uncertain','skipped')),
 lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 detail text, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,order_id,stage_id,event)
);
GRANT SELECT ON public.florist_notifications TO authenticated;
GRANT ALL ON public.florist_notifications TO service_role;
ALTER TABLE public.florist_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own floral notices" ON public.florist_notifications FOR SELECT TO authenticated
 USING (public.florist_can_manage(company_id));
CREATE INDEX IF NOT EXISTS florist_notifications_order ON public.florist_notifications(company_id,order_id,created_at);

CREATE OR REPLACE FUNCTION public.florist_transition(_company uuid,_order uuid,_stage text DEFAULT NULL,_target text DEFAULT 'confirm')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; stages jsonb; snapshot jsonb; row_stage jsonb; idx integer; event_name text; done boolean;
BEGIN
 IF NOT public.florist_can_manage(_company) THEN RAISE EXCEPTION 'Sem acesso a esta loja'; END IF;
 IF NOT public.is_company_module_enabled(_company,'floricultura') THEN RAISE EXCEPTION 'Perfil floricultura não ativo'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order AND company_id=_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
 IF o.status='canceled' OR COALESCE(o.notes,'') LIKE '%[CANCELADA]%' THEN RAISE EXCEPTION 'Pedido cancelado'; END IF;
 IF _target NOT IN ('confirm','ready_for_pickup','out_for_delivery','delivered','picked_up') THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'quantity',quantity,'notes',notes) ORDER BY id)
 INTO snapshot FROM public.order_items WHERE order_id=_order AND company_id=_company;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'Pedido sem itens'; END IF;
 stages := o.florist_fulfillments;
 IF jsonb_array_length(stages)=0 THEN
   IF o.status='delivered' THEN RAISE EXCEPTION 'Pedido já finalizado; não serão recriadas notificações'; END IF;
   SELECT jsonb_agg(jsonb_build_object('id',stage_key,'mode',mode,'itemIds',ids,'status','pending') ORDER BY stage_key)
   INTO stages FROM (
     SELECT stage_key,mode,jsonb_agg(id ORDER BY id) ids FROM (
       SELECT id,
        COALESCE('destino-'||(regexp_match(COALESCE(notes,''),'DESTINO\s+([0-9]+):','i'))[1],'legacy') stage_key,
        CASE WHEN COALESCE(notes,'') ~* 'DESTINO\s+[0-9]+:.*Entrega\s+[0-9]{2}/'
         OR (COALESCE(notes,'') !~* 'DESTINO\s+[0-9]+:' AND nullif(trim(o.delivery_address),'') IS NOT NULL)
         THEN 'delivery' ELSE 'pickup' END mode
       FROM public.order_items WHERE order_id=_order AND company_id=_company
     ) items GROUP BY stage_key,mode
   ) grouped;
   IF (SELECT count(*) FROM jsonb_array_elements(stages)) <> (SELECT count(DISTINCT s->>'id') FROM jsonb_array_elements(stages) s)
     THEN RAISE EXCEPTION 'Destinos inconsistentes; revise os itens antes de confirmar'; END IF;
 ELSE
   IF snapshot IS DISTINCT FROM o.florist_items_snapshot THEN RAISE EXCEPTION 'Os itens foram alterados após confirmação; revise as remessas antes de continuar'; END IF;
 END IF;
 PERFORM set_config('app.florist_transition','on',true);
 IF _target='confirm' THEN
   IF o.confirmed_at IS NULL THEN
     UPDATE public.orders SET confirmed_at=now(),florist_fulfillments=stages,florist_items_snapshot=snapshot WHERE id=_order AND company_id=_company;
     INSERT INTO public.florist_notifications(company_id,order_id,event) VALUES(_company,_order,'confirmed') ON CONFLICT DO NOTHING;
   END IF;
 ELSE
   IF o.confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirme o pedido primeiro'; END IF;
   SELECT ordinality::integer-1,value INTO idx,row_stage FROM jsonb_array_elements(stages) WITH ORDINALITY WHERE value->>'id'=_stage;
   IF row_stage IS NULL THEN RAISE EXCEPTION 'Remessa não encontrada'; END IF;
   IF row_stage->>'status' <> _target THEN
     IF NOT ((row_stage->>'mode'='pickup' AND ((row_stage->>'status'='pending' AND _target='ready_for_pickup') OR (row_stage->>'status'='ready_for_pickup' AND _target='picked_up')))
       OR (row_stage->>'mode'='delivery' AND ((row_stage->>'status'='pending' AND _target='out_for_delivery') OR (row_stage->>'status'='out_for_delivery' AND _target='delivered'))))
       THEN RAISE EXCEPTION 'Transição não permitida para esta remessa'; END IF;
     row_stage := row_stage || jsonb_build_object('status',_target,'updatedAt',now());
     stages := jsonb_set(stages,ARRAY[idx::text],row_stage);
     IF _target <> 'picked_up' THEN
       INSERT INTO public.florist_notifications(company_id,order_id,stage_id,event) VALUES(_company,_order,_stage,_target) ON CONFLICT DO NOTHING;
     END IF;
   END IF;
   SELECT bool_and(s->>'status' IN ('delivered','picked_up')) INTO done FROM jsonb_array_elements(stages) s;
   UPDATE public.orders SET florist_fulfillments=stages,florist_items_snapshot=snapshot,
     status=CASE WHEN done THEN 'delivered'::public.order_status
       WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stages) s WHERE s->>'status'='pending') THEN 'ready'::public.order_status ELSE o.status END
     WHERE id=_order AND company_id=_company;
   IF done THEN
     INSERT INTO public.florist_notifications(company_id,order_id,event) VALUES(_company,_order,'completed') ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 PERFORM set_config('app.florist_transition','off',true);
 SELECT * INTO o FROM public.orders WHERE id=_order AND company_id=_company;
 RETURN jsonb_build_object('status',o.status,'confirmedAt',o.confirmed_at,'stages',o.florist_fulfillments);
END;
$$;
REVOKE ALL ON FUNCTION public.florist_transition(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.florist_transition(uuid,uuid,text,text) TO authenticated;

-- Do not allow the former whole-order button or a forged JSON update to bypass stages.
CREATE OR REPLACE FUNCTION public.florist_guard_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.is_company_module_enabled(NEW.company_id,'floricultura') THEN
   IF NEW.florist_fulfillments IS DISTINCT FROM OLD.florist_fulfillments OR NEW.florist_items_snapshot IS DISTINCT FROM OLD.florist_items_snapshot THEN
     IF current_setting('app.florist_transition',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use as ações individuais das remessas'; END IF;
   END IF;
   IF NEW.status='delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN
     IF jsonb_array_length(NEW.florist_fulfillments)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.florist_fulfillments) s WHERE s->>'status' NOT IN ('delivered','picked_up'))
       THEN RAISE EXCEPTION 'Existem entregas ou retiradas pendentes'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER florist_guard_order BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.florist_guard_order();

CREATE OR REPLACE FUNCTION public.florist_claim_notice(_company uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; n public.florist_notifications; token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order AND company_id=_company FOR UPDATE;
 IF NOT FOUND OR NOT public.is_company_module_enabled(_company,'floricultura') THEN RETURN NULL; END IF;
 IF o.status='canceled' OR COALESCE(o.notes,'') LIKE '%[CANCELADA]%' THEN
   UPDATE public.florist_notifications SET status='skipped',detail='Pedido cancelado' WHERE company_id=_company AND order_id=_order AND status IN ('queued','failed');
   RETURN NULL;
 END IF;
 UPDATE public.florist_notifications SET status='uncertain',detail='Envio interrompido; confira antes de reenviar',lease_token=NULL,lease_until=NULL
 WHERE company_id=_company AND order_id=_order AND status='sending' AND lease_until < now();
 SELECT * INTO n FROM public.florist_notifications WHERE company_id=_company AND order_id=_order AND status NOT IN ('accepted','skipped') ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR n.status <> 'queued' THEN RETURN NULL; END IF;
 UPDATE public.florist_notifications SET status='sending',lease_token=token,lease_until=now()+interval '45 seconds',attempts=attempts+1 WHERE id=n.id;
 RETURN to_jsonb(n)||jsonb_build_object('lease_token',token);
END;
$$;
REVOKE ALL ON FUNCTION public.florist_claim_notice(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.florist_claim_notice(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.florist_finish_notice(_id uuid,_token uuid,_status text,_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _status NOT IN ('accepted','failed','uncertain','skipped') THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
 UPDATE public.florist_notifications SET status=_status,detail=left(_detail,300),accepted_at=CASE WHEN _status='accepted' THEN now() ELSE NULL END,lease_token=NULL,lease_until=NULL
 WHERE id=_id AND status='sending' AND lease_token=_token;
END;
$$;
REVOKE ALL ON FUNCTION public.florist_finish_notice(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.florist_finish_notice(uuid,uuid,text,text) TO service_role;
