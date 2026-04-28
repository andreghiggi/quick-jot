-- 1) Função que faz a limpeza com retenção de 90 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_whatsapp_messages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int := 0;
BEGIN
  DELETE FROM public.whatsapp_messages
  WHERE created_at < (now() - interval '90 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'cleanup_old_whatsapp_messages: deleted % rows at %', deleted_count, now();

  RETURN jsonb_build_object(
    'deleted', deleted_count,
    'ran_at', now()
  );
END;
$$;

-- 2) Agenda no pg_cron — todo dia às 03:00 America/Sao_Paulo (= 06:00 UTC)
-- Remove agendamento anterior se existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-whatsapp-messages-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-whatsapp-messages-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-whatsapp-messages-daily',
  '0 6 * * *',  -- 06:00 UTC = 03:00 America/Sao_Paulo
  $$ SELECT public.cleanup_old_whatsapp_messages(); $$
);
