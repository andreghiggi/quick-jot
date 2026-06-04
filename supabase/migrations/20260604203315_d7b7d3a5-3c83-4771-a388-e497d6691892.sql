UPDATE public.nfce_records
SET
  ambiente = 'producao',
  qrcode_url = CASE
    WHEN qrcode_url IS NOT NULL AND position('|2|' in qrcode_url) > 0
      THEN regexp_replace(qrcode_url, '\|2\|', '|1|')
    ELSE qrcode_url
  END,
  updated_at = now()
WHERE ambiente IS DISTINCT FROM 'producao'
  AND (
    (response_payload->'data'->>'xml_retorno') ILIKE '%<tpAmb>1</tpAmb>%'
    OR (response_payload->>'xml_retorno') ILIKE '%<tpAmb>1</tpAmb>%'
  );