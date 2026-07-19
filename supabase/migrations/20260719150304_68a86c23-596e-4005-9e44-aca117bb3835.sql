
SELECT net.http_post(
  url := 'https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/backup-mirror',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-backup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TRIGGER_SECRET' limit 1)
  ),
  body := jsonb_build_object('mode','mirror','manual_test',true)
) AS request_id;
