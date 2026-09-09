---
name: comandatech-prod-safe
description: >-
  Protege o ambiente de produção ComandaTech (Lovable, main, VPS, Supabase iwmrtxdzlkasuzutxvhh).
  Use SOMENTE quando o usuário pedir explicitamente alterar produção, deploy na Lovable, merge
  para main, ou cutover. Por padrão, nunca deploy, push main, supabase functions deploy na origem,
  ou escrita no banco Lovable.
---

# ComandaTech — Produção intocável (salvo pedido explícito)

## Ambientes

| Ambiente | Identificador | Pode alterar sem pedido? |
|----------|---------------|--------------------------|
| **Produção** | Lovable, branch `main`, VPS, Supabase `iwmrtxdzlkasuzutxvhh` | **Não** |
| **Dev Cursor** | branch `Cursor`, localhost, Supabase externo `vyotbtmnnosiejyltlxc` | Sim |
| **Espelho/backup** | Supabase externo (destino do mirror) | Sim (escrita no destino) |

## Proibido sem pedido explícito do usuário

- Push ou merge na branch `main`
- `supabase functions deploy` no projeto Lovable/origem
- Deploy VPS (push main dispara CI)
- DELETE/UPDATE/INSERT no banco **origem** (Lovable)
- Desconectar Lovable do GitHub
- Alterar secrets de produção (VPS, Lovable, Vault origem)

## Permitido por padrão

- Trabalhar na branch **`Cursor`**
- Push para `origin Cursor`
- Leitura do código e do banco origem (SELECT via scripts de backup)
- Escrita no Supabase **externo** (espelho)
- `npm run dev` local com `.env.local`
- `npm run mirror-auth` (lê origem, escreve destino)

## Backup / espelhamento

- `backup-mirror` e `mirror-auth`: **SELECT na origem**, escrita **só no destino externo**
- Deploy da edge function na Lovable: **somente quando o usuário pedir**

## Quando o usuário pedir produção

Confirmar escopo antes de agir:

1. O que exatamente vai para produção?
2. Merge `Cursor → main` ou só deploy de function?
3. Há janela de manutenção?

Ver também: `docs/CUTOVER-SEMANA2.md`, skill `comandatech-deploy`.
