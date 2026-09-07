-- Agenda sincronização automática NFC-e (contingência + órfãs + presas)
-- A cada 5 minutos — evita notas travadas em processando no Monitor Comanda

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('nfce-contingencia-sync-5m')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nfce-contingencia-sync-5m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'nfce-contingencia-sync-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/nfce-contingencia-sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
