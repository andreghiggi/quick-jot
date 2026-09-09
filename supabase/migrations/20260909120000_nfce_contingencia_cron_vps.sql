-- pg_cron: reconcilia NFC-e em contingência na VPS (não Lovable Cloud)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('nfce-contingencia-sync-vps')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nfce-contingencia-sync-vps');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'nfce-contingencia-sync-vps',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://api.comandatech.com.br/functions/v1/nfce-contingencia-sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Índice parcial para órfãs pendentes
CREATE INDEX IF NOT EXISTS idx_nfce_records_orphan_pending
  ON public.nfce_records (company_id, created_at DESC)
  WHERE nfce_id IS NULL AND status IN ('processando', 'pendente');
