UPDATE nfce_records 
SET 
  numero = CAST(CAST(substring(chave_acesso from 26 for 9) AS bigint) AS text),
  serie = CAST(CAST(substring(chave_acesso from 23 for 3) AS bigint) AS text)
WHERE chave_acesso IS NOT NULL 
  AND length(chave_acesso) >= 34 
  AND numero IS NULL