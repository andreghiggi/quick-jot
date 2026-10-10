-- Vincula a NFC-e nº 14809 (já AUTORIZADA na SEFAZ) à venda de R$ 25,00 da Cozinha da Ruiva.
-- Escopo restrito: company 55181771-..., sale 780e3fe6-... Nenhuma emissão, nenhum número consumido.
DO $$
DECLARE
  v_company uuid := '55181771-8b10-4af1-afc3-472c090a49be';
  v_sale uuid := '780e3fe6-3cd1-4714-8a55-c1ebb8babcab';
  v_ext text := 'FCX-RETRO-780e3fe6-3cd1-4714-8a55-c1ebb8babcab';
  v_chave text := '43261017603672000194650010000148091973198441';
  v_target uuid;
BEGIN
  -- Se a chave já estiver vinculada, não faz nada.
  IF EXISTS (SELECT 1 FROM public.nfce_records WHERE company_id = v_company AND chave_acesso = v_chave) THEN
    RAISE NOTICE 'Chave 14809 já vinculada; nada a fazer.';
    RETURN;
  END IF;

  -- 1) Tentativas antigas sem protocolo da mesma venda (exceto RETRO) viram rejeitada.
  UPDATE public.nfce_records
     SET status = 'rejeitada',
         motivo_rejeicao = COALESCE(motivo_rejeicao,'') || ' | Substituída pela NFC-e 14809 autorizada (10/10/2026).',
         updated_at = now()
   WHERE company_id = v_company AND sale_id = v_sale
     AND external_id <> v_ext AND protocolo IS NULL
     AND status IN ('processando','pendente');

  -- 2) Escolhe o registro alvo: RETRO se existir, senão a tentativa antiga mais recente.
  SELECT id INTO v_target FROM public.nfce_records
   WHERE company_id = v_company AND external_id = v_ext LIMIT 1;
  IF v_target IS NULL THEN
    SELECT id INTO v_target FROM public.nfce_records
     WHERE company_id = v_company AND sale_id = v_sale AND protocolo IS NULL
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_target IS NULL THEN
    INSERT INTO public.nfce_records (company_id, sale_id, external_id, nfce_id, numero, serie, status, ambiente, valor_total, chave_acesso, protocolo, motivo_rejeicao)
    VALUES (v_company, v_sale, v_ext, '2fe01bd6-95d5-46a4-8e51-6339c4783073', '000014809', '1', 'autorizada', 'producao', 25.00, v_chave, '243261948622011', NULL);
    RAISE NOTICE 'Registro 14809 inserido.';
  ELSE
    UPDATE public.nfce_records
       SET external_id = v_ext,
           nfce_id = '2fe01bd6-95d5-46a4-8e51-6339c4783073',
           numero = '000014809', serie = '1',
           status = 'autorizada', ambiente = 'producao',
           chave_acesso = v_chave, protocolo = '243261948622011',
           motivo_rejeicao = NULL, updated_at = now()
     WHERE id = v_target;
    RAISE NOTICE 'Registro % atualizado para 14809 autorizada.', v_target;
  END IF;
END $$;
