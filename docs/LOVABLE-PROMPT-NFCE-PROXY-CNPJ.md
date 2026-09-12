# Lovable — deploy nfce-proxy (CPF/CNPJ)

Cole no chat Lovable quando precisar publicar a correção de CPF/CNPJ **sem emitir nota de teste**:

```
Deploy APENAS a edge function nfce-proxy do repositório GitHub (branch main, commit 0689dc5a ou mais recente).

Escopo mínimo — não alterar UI, DANFE, outros fluxos nem emitir NFC-e de teste.

A correção necessária: quando payload.destinatario tiver cpf ou cnpj, mapear também emitPayload.cliente = { cpf/cnpj, nome } porque a Fiscal Flow ignora destinatario e só grava <dest> no XML com cliente.

Confirmar após deploy: função nfce-proxy ativa no projeto iwmrtxdzlkasuzutxvhh.
```

Alternativa: GitHub → Settings → Secrets → `SUPABASE_ACCESS_TOKEN` → re-run workflow `Deploy Supabase Edge Functions`.
