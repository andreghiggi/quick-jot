-- Cleanup orphaned locks blocking auto-reply
DELETE FROM public.whatsapp_auto_reply_locks
WHERE created_at < now() - interval '5 minutes';

-- Auto-cleanup function: remove old locks on each insert
CREATE OR REPLACE FUNCTION public.cleanup_old_whatsapp_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_auto_reply_locks
  WHERE created_at < now() - interval '5 minutes';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_whatsapp_locks ON public.whatsapp_auto_reply_locks;
CREATE TRIGGER trg_cleanup_whatsapp_locks
  BEFORE INSERT ON public.whatsapp_auto_reply_locks
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_old_whatsapp_locks();