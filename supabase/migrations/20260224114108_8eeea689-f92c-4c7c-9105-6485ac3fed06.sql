UPDATE nfce_records 
SET valor_total = COALESCE(
  (SELECT SUM((item->>'quantidade')::numeric * (item->>'valor_unitario')::numeric)
   FROM jsonb_array_elements(request_payload->'itens') AS item),
  0
)
WHERE valor_total = 0 AND request_payload IS NOT NULL AND request_payload->'itens' IS NOT NULL;