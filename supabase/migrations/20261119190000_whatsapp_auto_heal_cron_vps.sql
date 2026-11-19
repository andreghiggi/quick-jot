-- pg_cron: reaplica webhook/ajustes das instâncias WhatsApp na VPS a cada 10 min
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-auto-heal-vps')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-auto-heal-vps');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-auto-heal-vps',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://api.comandatech.com.br/functions/v1/whatsapp-auto-heal',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
