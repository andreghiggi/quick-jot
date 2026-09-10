# Plan - Deploy Edge Function `export-migration`

Deploy da edge function `export-migration` no projeto Supabase, usando o código já presente na branch `main` (commit `feb34d5d`), que inclui o endpoint `POST` de import/upsert.

## Scope
- Deploy apenas da function `export-migration`.
- Nenhuma alteração manual de dados, schema, secrets ou outras functions.
- Nenhuma emissão fiscal, pausa ou rotação de credenciais.

## Execution
- Rodar `supabase functions deploy export-migration` (ou equivalente via ferramenta de deploy) no projeto de origem.
- Verificar retorno do deploy (sucesso/erro) sem expor tokens ou secrets.
