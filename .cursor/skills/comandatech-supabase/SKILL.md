---
name: comandatech-supabase
description: >-
  Orienta trabalho com Supabase no ComandaTech — migrations, Edge Functions,
  client, RLS e Supabase externo vs produção. Use ao criar migrations, editar
  functions, queries, auth, backup ou quando o usuário mencionar Supabase,
  banco de dados ou Edge Functions.
---

# ComandaTech — Supabase

## Ambientes

| Ambiente | Config | Uso |
|----------|--------|-----|
| Produção (Lovable) | `.env` no repo | VPS + Lovable |
| Dev local | `.env.local` | Supabase **externo** (backup) |

Nunca commitar `.env.local`. URL padrão: `https://<project_id>.supabase.co`

## Client frontend

```typescript
import { supabase } from "@/integrations/supabase/client";
```

Arquivo gerado — tipos em `src/integrations/supabase/types.ts`.

## Migrations

- Pasta: `supabase/migrations/`
- Nomenclatura: timestamp + UUID (gerado pelo CLI)
- **Dev externo**: aplicar migrations no projeto externo antes de testar features novas
- Criar migration nova só quando o usuário pedir alteração de schema

## Edge Functions

Pasta: `supabase/functions/<nome>/index.ts`

Principais:
- `nfce-proxy`, `nfce-webhook`, `nfce-contingencia-sync` — NFC-e
- `nfe-proxy` — NFe
- `send-whatsapp`, `whatsapp-evolution`, `whatsapp-webhook` — WhatsApp
- `tef-webservice`, `pinpdv-payment` — pagamentos
## Backup externo (espelho Lovable → vyotbtmnnosiejyltlxc)

- `backup-mirror` — espelha `auth.users`, `auth.identities` + schema `public`
- `npm run mirror-auth` — sync auth local sem deploy (ver `docs/BACKUP-AUTH-MIRROR.md`)
- Origem: **somente leitura**. Destino externo: escrita.
- **Não deployar** edge function na Lovable sem pedido explícito — skill `comandatech-prod-safe`
- `create-company-user`, `create-reseller-user` — onboarding

Deploy de functions: Supabase CLI (`supabase functions deploy`) — confirmar com usuário qual projeto (externo vs prod).

## Boas práticas

1. Preferir hooks existentes em `src/hooks/` antes de nova query
2. Respeitar RLS — testar com usuário real no dev
3. Não expor service role no frontend
4. Alterações de schema: migration + types (se regenerados)

## Backup externo

Usuário mantém Supabase externo como backup além do cloud Lovable. Dev local aponta para externo via `.env.local`.
