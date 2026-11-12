-- Adiciona marcação de conclusão de sincronização fiscal em pdv_sales.
-- Hoje a tabela não registra, do lado da venda, que a NFC-e foi autorizada —
-- apenas nfce_records sabe disso. Isso impede qualquer consumidor (job,
-- tela, relatório) de saber "esta venda já está fiscal-concluída" sem fazer
-- join com nfce_records. Passa a ser preenchido pelo nfce-webhook ao
-- processar o evento nfce.autorizada.
ALTER TABLE public.pdv_sales
  ADD COLUMN IF NOT EXISTS nfce_sync_completed_at timestamptz NULL;

COMMENT ON COLUMN public.pdv_sales.nfce_sync_completed_at IS
  'Timestamp em que a NFC-e desta venda foi confirmada autorizada pelo webhook da Fiscal Flow. NULL = ainda não confirmada (não significa pendente de emissão; ver nfce_records para o status real).';

CREATE INDEX IF NOT EXISTS idx_pdv_sales_nfce_sync_completed_at
  ON public.pdv_sales (company_id, nfce_sync_completed_at)
  WHERE nfce_sync_completed_at IS NULL;
