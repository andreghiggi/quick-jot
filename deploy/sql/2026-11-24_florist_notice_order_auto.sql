-- Notices created in one transaction share a timestamp: completion must come last.
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
 SELECT * INTO n FROM public.florist_notifications WHERE company_id=_company AND order_id=_order AND status NOT IN ('accepted','skipped')
 ORDER BY created_at,CASE event WHEN 'received' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'completed' THEN 3 ELSE 2 END,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR n.status <> 'queued' THEN RETURN NULL; END IF;
 UPDATE public.florist_notifications SET status='sending',lease_token=token,lease_until=now()+interval '45 seconds',attempts=attempts+1 WHERE id=n.id;
 RETURN to_jsonb(n)||jsonb_build_object('lease_token',token);
END;
$$;
REVOKE ALL ON FUNCTION public.florist_claim_notice(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.florist_claim_notice(uuid,uuid) TO service_role;
