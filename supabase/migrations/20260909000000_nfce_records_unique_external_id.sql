-- Remove duplicatas de external_id mantendo o registro mais completo/recente
DELETE FROM public.nfce_records a
USING public.nfce_records b
WHERE a.company_id = b.company_id
  AND a.external_id = b.external_id
  AND a.id <> b.id
  AND (
    (b.nfce_id IS NOT NULL AND a.nfce_id IS NULL)
    OR (b.status = 'autorizada' AND a.status <> 'autorizada')
    OR (a.created_at < b.created_at AND b.status = a.status)
  );

-- Índice único: impede numeração fantasma por race/retry com mesmo external_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfce_records_company_external_id_unique
  ON public.nfce_records (company_id, external_id);
