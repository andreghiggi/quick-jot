-- Destrava NFC-e travada (R$ 25,00) da Cozinha da Ruiva para permitir reemissão limpa (nº 14809).
-- Escopo restrito: apenas a venda 780e3fe6-3cd1-4714-8a55-c1ebb8babcab, sem nota autorizada.
DO $$
DECLARE v_count int;
BEGIN
  UPDATE public.nfce_records
     SET status = 'rejeitada',
         motivo_rejeicao = COALESCE(motivo_rejeicao,'') || ' | Destravado manualmente em 10/10/2026: número 14807 consumido por outra venda; reemitir pela Frente de Caixa.',
         updated_at = now()
   WHERE company_id = '55181771-8b10-4af1-afc3-472c090a49be'
     AND sale_id = '780e3fe6-3cd1-4714-8a55-c1ebb8babcab'
     AND status IN ('processando','pendente')
     AND protocolo IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Registros destravados: %', v_count;
END $$;
