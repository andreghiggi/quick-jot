-- Shared leases serialize restarts across workers and companies; no pg_cron extension.
CREATE TABLE IF NOT EXISTS public.whatsapp_recovery (
  instance_name text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'ready' CHECK (phase IN ('ready','recovering','retry_pending','blocked','needs_qr','manual_disconnect')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 2),
  next_restart_at timestamptz NOT NULL DEFAULT now(),
  last_restart_at timestamptz,
  checked_at timestamptz NOT NULL DEFAULT now(),
  detail text,
  lease_token uuid,
  lease_until timestamptz
);
GRANT SELECT ON public.whatsapp_recovery TO authenticated;
GRANT ALL ON public.whatsapp_recovery TO service_role;
ALTER TABLE public.whatsapp_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins view recovery" ON public.whatsapp_recovery FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.whatsapp_recovery_gate (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  lease_token uuid,
  lease_until timestamptz,
  next_allowed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_recovery_gate TO service_role;
ALTER TABLE public.whatsapp_recovery_gate ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.whatsapp_next_restart(_name text, _after timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH slot AS (
    SELECT (('x' || substr(md5(_name),1,8))::bit(32)::bigint % 240) * 60 AS offset_seconds
  ), candidate AS (
    SELECT to_timestamp(floor(extract(epoch FROM _after) / 14400) * 14400 + offset_seconds) AS at FROM slot
  ) SELECT CASE WHEN at > _after THEN at ELSE at + interval '4 hours' END FROM candidate
$$;
REVOKE ALL ON FUNCTION public.whatsapp_next_restart(text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_next_restart(text,timestamptz) TO service_role;

-- Additive backfill: only existing connected sessions are eligible for automation.
INSERT INTO public.whatsapp_recovery(instance_name,company_id,phase,next_restart_at)
SELECT instance_name,company_id,
  CASE WHEN status = 'connected' THEN 'ready' ELSE 'manual_disconnect' END,
  public.whatsapp_next_restart(instance_name,now())
FROM public.whatsapp_instances WHERE instance_name LIKE 'ct-%'
ON CONFLICT (instance_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.whatsapp_observe_connection(_name text,_company uuid,_state text,_logged_out boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.whatsapp_recovery;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_instances WHERE instance_name=_name AND company_id=_company) THEN
    RAISE EXCEPTION 'Instance identity mismatch';
  END IF;
  INSERT INTO public.whatsapp_recovery(instance_name,company_id,next_restart_at)
    VALUES (_name,_company,public.whatsapp_next_restart(_name,now())) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.whatsapp_recovery WHERE instance_name=_name FOR UPDATE;
  IF _state = 'manual_disconnect' OR _logged_out THEN
    UPDATE public.whatsapp_recovery SET phase=CASE WHEN _logged_out THEN 'needs_qr' ELSE 'manual_disconnect' END,
      detail=CASE WHEN _logged_out THEN 'Sessão encerrada no WhatsApp; novo QR necessário.' ELSE 'Desconectada pelo operador.' END,
      checked_at=now() WHERE instance_name=_name;
  ELSIF r.lease_until > now() THEN
    RETURN; -- close/open from our own restart cannot recursively trigger another restart.
  ELSIF _state = 'open' THEN
    UPDATE public.whatsapp_recovery SET phase='ready',attempts=0,checked_at=now(),
      detail='Conectada; recebimento de mensagens ainda depende de evento real.',
      next_restart_at=CASE WHEN r.phase IN ('needs_qr','blocked','manual_disconnect') THEN public.whatsapp_next_restart(_name,now()) ELSE r.next_restart_at END
      WHERE instance_name=_name;
  ELSIF _state = 'close' AND r.phase NOT IN ('manual_disconnect','needs_qr','blocked') THEN
    UPDATE public.whatsapp_recovery SET phase='retry_pending',checked_at=now(),
      detail='Conexão caiu; recuperação pendente.' WHERE instance_name=_name;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_observe_connection(text,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_observe_connection(text,uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_claim_restart(_name text,_company uuid,_manual boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.whatsapp_recovery; g public.whatsapp_recovery_gate; token uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_instances i JOIN public.company_modules m ON m.company_id=i.company_id
    WHERE i.instance_name=_name AND i.company_id=_company AND m.module_name='whatsapp' AND m.enabled) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.whatsapp_recovery_gate(id) VALUES(true) ON CONFLICT DO NOTHING;
  SELECT * INTO g FROM public.whatsapp_recovery_gate WHERE id=true FOR UPDATE;
  IF g.lease_until > now() OR g.next_allowed_at > now() THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.whatsapp_recovery WHERE instance_name=_name AND company_id=_company FOR UPDATE;
  IF NOT FOUND OR r.lease_until > now() OR r.phase IN ('needs_qr','manual_disconnect') THEN RETURN NULL; END IF;
  IF NOT _manual AND (r.phase='blocked' OR r.attempts >= 2 OR
    (r.phase NOT IN ('retry_pending','recovering') AND r.next_restart_at > now())) THEN RETURN NULL; END IF;
  -- Expired worker leases count as failed attempts instead of looping after crashes.
  IF NOT _manual AND r.attempts >= 2 THEN RETURN NULL; END IF;
  UPDATE public.whatsapp_recovery_gate SET lease_token=token,lease_until=now()+interval '45 seconds',
    next_allowed_at=now()+interval '1 minute' WHERE id=true;
  UPDATE public.whatsapp_recovery SET phase='recovering',attempts=CASE WHEN _manual THEN 1 ELSE least(attempts+1,2) END,
    lease_token=token,lease_until=now()+interval '45 seconds',last_restart_at=now(),checked_at=now(),
    detail='Recuperação em andamento.' WHERE instance_name=_name;
  RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_claim_restart(text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_claim_restart(text,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_finish_restart(_name text,_token uuid,_open boolean,_detail text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_recovery SET
    phase=CASE WHEN phase IN ('needs_qr','manual_disconnect') THEN phase WHEN _open THEN 'ready' WHEN attempts>=2 THEN 'blocked' ELSE 'retry_pending' END,
    attempts=CASE WHEN _open THEN 0 ELSE attempts END,
    next_restart_at=CASE WHEN _open THEN public.whatsapp_next_restart(_name,now()) ELSE next_restart_at END,
    detail=CASE WHEN phase IN ('needs_qr','manual_disconnect') THEN detail ELSE left(_detail,300) END,
    checked_at=now(),lease_until=NULL,lease_token=NULL
    WHERE instance_name=_name AND lease_token=_token;
  UPDATE public.whatsapp_recovery_gate SET lease_token=NULL,lease_until=NULL WHERE id=true AND lease_token=_token;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_finish_restart(text,uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_finish_restart(text,uuid,boolean,text) TO service_role;
