SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false);
SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100');
SELECT public.assert_test((SELECT jsonb_array_length(florist_fulfillments)=3 FROM public.orders WHERE id='00000000-0000-0000-0000-000000000100'),'two deliveries and one pickup = three persisted stages');
SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100');
SELECT public.assert_test((SELECT count(*)=1 FROM public.florist_notifications WHERE event='confirmed'),'confirmation is idempotent');
DO $$ BEGIN
 BEGIN PERFORM public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','destino-3','picked_up'); RAISE EXCEPTION 'unexpected premature pickup';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected premature pickup' THEN RAISE; END IF; END;
END $$;
SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','destino-3','ready_for_pickup');
SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','destino-1','out_for_delivery');
SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','destino-1','delivered');
SELECT public.assert_test((SELECT status<>'delivered' FROM public.orders WHERE id='00000000-0000-0000-0000-000000000100'),'first bouquet delivered does not finish the whole order');
SELECT public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','destino-2','out_for_delivery');
SELECT public.assert_test((SELECT count(*)=0 FROM public.florist_notifications WHERE event='completed'),'ready pickup and unfinished bouquet do not create final notice');
DO $$ BEGIN
 BEGIN UPDATE public.orders SET status='delivered' WHERE id='00000000-0000-0000-0000-000000000100'; RAISE EXCEPTION 'unexpected bypass';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected bypass' THEN RAISE; END IF; END;
END $$;
SELECT public.assert_test(NOT has_function_privilege('anon','public.florist_transition(uuid,uuid,text,text)','EXECUTE'),'anonymous users cannot advance stages');
SELECT public.assert_test(NOT has_function_privilege('authenticated','public.florist_claim_notice(uuid,uuid)','EXECUTE'),'only service can claim sends');
SELECT public.assert_test(NOT has_table_privilege('authenticated','public.florist_notifications','UPDATE'),'staff cannot forge send outcomes');
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM public.florist_transition('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','destino-2','delivered'); RAISE EXCEPTION 'unexpected cross tenant';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected cross tenant' THEN RAISE; END IF; END;
END $$;
UPDATE public.orders SET status='delivered' WHERE id='00000000-0000-0000-0000-000000000200';
SELECT public.assert_test((SELECT status='delivered' FROM public.orders WHERE id='00000000-0000-0000-0000-000000000200'),'restaurant whole-order status remains unchanged');