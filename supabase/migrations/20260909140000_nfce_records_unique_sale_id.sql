-- Impede duas NFC-e ativas para a mesma venda (independente do prefixo external_id).
-- Complementa idx único em (company_id, external_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfce_records_company_sale_blocking
  ON public.nfce_records (company_id, sale_id)
  WHERE sale_id IS NOT NULL
    AND status IN ('autorizada', 'processando', 'pendente');

COMMENT ON INDEX public.idx_nfce_records_company_sale_blocking IS
  'Uma venda (sale_id) só pode ter uma NFC-e ativa por empresa; evita FCX vs FCX-RETRO e PDV vs PDVV2.';
