-- Marca NFC-e duplicadas (mesmo company_id + sale_id ativas) como substituida,
-- mantendo o registro canônico (prefixo determinístico FCX-/PDVV2-/PDV- ou o mais antigo).
WITH active AS (
  SELECT *
  FROM public.nfce_records
  WHERE sale_id IS NOT NULL
    AND status IN ('autorizada', 'processando', 'pendente')
),
ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, sale_id
      ORDER BY
        CASE
          WHEN external_id = 'FCX-' || sale_id::text THEN 0
          WHEN external_id = 'PDVV2-' || sale_id::text THEN 1
          WHEN external_id = 'PDV-' || sale_id::text THEN 2
          WHEN external_id = 'TAB-MULTI-' || sale_id::text THEN 3
          WHEN external_id LIKE 'FCX-RETRO-' || sale_id::text || '%' THEN 5
          ELSE 4
        END,
        created_at ASC
    ) AS rn
  FROM active
)
UPDATE public.nfce_records n
SET
  status = 'substituida',
  motivo_rejeicao = COALESCE(
    NULLIF(TRIM(n.motivo_rejeicao), ''),
    'Duplicata histórica — substituída por registro canônico (migração sale_id).'
  )
FROM ranked r
WHERE n.id = r.id
  AND r.rn > 1;
