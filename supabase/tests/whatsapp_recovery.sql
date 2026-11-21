-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/whatsapp_recovery.sql.
-- This is one rolled-back transaction: no provider calls or persistent changes.
BEGIN;
DO $$
DECLARE n text; c uuid; other_n text; other_c uuid; token uuid; second uuid; p text; a integer; scheduled timestamptz; base timestamptz := '2026-11-21 20:00:00+00';
BEGIN
  SELECT i.instance_name,i.company_id INTO n,c FROM public.whatsapp_instances i
    JOIN public.company_modules m ON m.company_id=i.company_id AND m.module_name='whatsapp' AND m.enabled
    WHERE i.instance_name LIKE 'ct-%' LIMIT 1;
  IF n IS NULL THEN RAISE EXCEPTION 'No eligible fixture instance; recovery rules not tested'; END IF;
  SELECT instance_name,company_id INTO other_n,other_c FROM public.whatsapp_instances WHERE company_id<>c LIMIT 1;
  IF other_n IS NULL THEN RAISE EXCEPTION 'Second tenant fixture required'; END IF;
  INSERT INTO public.whatsapp_recovery(instance_name,company_id) VALUES(n,c) ON CONFLICT DO NOTHING;
  INSERT INTO public.whatsapp_recovery_gate(id) VALUES(true) ON CONFLICT DO NOTHING;
  UPDATE public.whatsapp_recovery_gate SET lease_until=NULL,lease_token=NULL,next_allowed_at=now();
  UPDATE public.whatsapp_recovery SET phase='ready',attempts=0,lease_token=NULL,lease_until=NULL,next_restart_at=now()+interval '1 minute' WHERE instance_name=n;
  scheduled := public.whatsapp_next_restart(n,base);
  ASSERT scheduled > base AND scheduled <= base+interval '4 hours', 'stagger within 4 hours';
  ASSERT public.whatsapp_next_restart(n,scheduled)=scheduled+interval '4 hours', 'exact four hour cycle';
  ASSERT public.whatsapp_claim_restart(n,c,false) IS NULL, 'preventive claim cannot run early';
  UPDATE public.whatsapp_recovery SET next_restart_at=now()-interval '1 minute' WHERE instance_name=n;
  ASSERT public.whatsapp_claim_restart(n,'00000000-0000-0000-0000-000000000000'::uuid,false) IS NULL, 'tenant mismatch denied';
  token := public.whatsapp_claim_restart(n,c,false);
  ASSERT token IS NOT NULL, 'due restart claimed';
  UPDATE public.whatsapp_recovery SET phase='ready',attempts=0,lease_until=NULL,next_restart_at=now()-interval '1 minute' WHERE instance_name=other_n;
  ASSERT public.whatsapp_claim_restart(other_n,other_c,false) IS NULL, 'global lease prevents simultaneous restarts across stores';
  ASSERT public.whatsapp_claim_restart(n,c,true) IS NULL, 'manual cannot overlap automated restart';
  PERFORM public.whatsapp_observe_connection(n,c,'close',false);
  SELECT phase INTO p FROM public.whatsapp_recovery WHERE instance_name=n;
  ASSERT p='recovering', 'restart-generated close cannot recurse';
  PERFORM public.whatsapp_finish_restart(n,gen_random_uuid(),true,'stale worker');
  ASSERT (SELECT lease_token=token FROM public.whatsapp_recovery WHERE instance_name=n), 'wrong lease cannot finish';
  PERFORM public.whatsapp_finish_restart(n,token,false,'first failure');
  SELECT phase,attempts INTO p,a FROM public.whatsapp_recovery WHERE instance_name=n;
  ASSERT p='retry_pending' AND a=1, 'first failure consumes one attempt';
  ASSERT public.whatsapp_claim_restart(n,c,false) IS NULL, 'global one minute cooldown';
  ASSERT public.whatsapp_claim_restart(other_n,other_c,false) IS NULL, 'global spacing applies to different stores after restart finishes';
  UPDATE public.whatsapp_recovery_gate SET next_allowed_at=now();
  second := public.whatsapp_claim_restart(n,c,false);
  ASSERT second IS NOT NULL, 'second attempt permitted';
  PERFORM public.whatsapp_finish_restart(n,second,false,'second failure');
  SELECT phase,attempts INTO p,a FROM public.whatsapp_recovery WHERE instance_name=n;
  ASSERT p='blocked' AND a=2, 'two failures trip breaker';
  UPDATE public.whatsapp_recovery_gate SET next_allowed_at=now();
  ASSERT public.whatsapp_claim_restart(n,c,false) IS NULL, 'third automatic attempt denied';
  token := public.whatsapp_claim_restart(n,c,true);
  ASSERT token IS NOT NULL, 'explicit manual retry can reset failure budget';
  PERFORM public.whatsapp_finish_restart(n,token,true,'verified connection only');
  SELECT phase,attempts,next_restart_at INTO p,a,scheduled FROM public.whatsapp_recovery WHERE instance_name=n;
  ASSERT p='ready' AND a=0 AND scheduled>now(), 'successful restart resets and reschedules';
  PERFORM public.whatsapp_observe_connection(n,c,'close',true);
  SELECT phase INTO p FROM public.whatsapp_recovery WHERE instance_name=n;
  ASSERT p='needs_qr', 'explicit logout signals QR';
  UPDATE public.whatsapp_recovery_gate SET next_allowed_at=now();
  ASSERT public.whatsapp_claim_restart(n,c,true) IS NULL, 'logout never automatically or manually restarts without QR';
  PERFORM public.whatsapp_observe_connection(n,c,'open',false);
  PERFORM public.whatsapp_observe_connection(n,c,'manual_disconnect',false);
  ASSERT public.whatsapp_claim_restart(n,c,false) IS NULL, 'operator disconnection remains stopped';
  ASSERT NOT has_function_privilege('authenticated','public.whatsapp_claim_restart(text,uuid,boolean)','EXECUTE'), 'users cannot call service restart claim';
  ASSERT NOT has_function_privilege('anon','public.whatsapp_claim_restart(text,uuid,boolean)','EXECUTE'), 'anonymous cannot call service restart claim';
  ASSERT NOT has_table_privilege('authenticated','public.whatsapp_recovery','UPDATE'), 'user cannot rewrite circuit breaker';
  ASSERT has_table_privilege('service_role','public.whatsapp_recovery','UPDATE'), 'service can persist recovery';
  RAISE NOTICE 'WhatsApp recovery: scheduling, tenant, lease, breaker and privilege assertions passed';
END $$;
ROLLBACK;
