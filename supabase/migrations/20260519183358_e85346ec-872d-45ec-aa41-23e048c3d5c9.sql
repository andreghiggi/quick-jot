DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname ILIKE '%followup%' OR command ILIKE '%whatsapp-followup%' OR command ILIKE '%whatsapp_followup%' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;