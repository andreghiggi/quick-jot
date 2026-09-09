---
name: comandatech-local-dev
description: >-
  Configura e opera o ambiente local do ComandaTech — npm install, npm run dev,
  .env.local, Supabase externo, reinício do Vite. Use ao rodar localhost, instalar
  dependências, configurar env, reiniciar servidor ou quando o usuário mencionar
  porta 8080, XAMPP ou desenvolvimento local.
---

# ComandaTech — Desenvolvimento local

## Stack local

- **Vite + React + TypeScript** — não é PHP/Apache
- Pasta `C:\xampp\htdocs\comandatech` é só workspace; app roda com Node.js
- Dev server: **http://localhost:8080** (`npm run dev`)

## Comandos

```powershell
cd C:\xampp\htdocs\comandatech
npm install
npm run dev      # porta 8080
npm run build    # validar produção
npm run lint     # informativo — codebase legado tem erros
```

## Variáveis de ambiente

| Arquivo | Uso |
|---------|-----|
| `.env` | Supabase Lovable (commitado — produção/CI) |
| `.env.local` | **Supabase externo dev** — não commitar |
| `.env.example` | Template sem segredos |

Variáveis Vite:
- `VITE_SUPABASE_URL` → `https://<project_id>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Após alterar `.env.local`, **reiniciar** `npm run dev` (Vite não recarrega env em caliente).

## Reiniciar dev server

1. Encerrar processo na porta 8080
2. `npm run dev` em background

O agente deve rodar esses comandos — não pedir ao usuário.

## Referências

- Regra: `.cursor/rules/comandatech-cursor.mdc`
- Fluxo: `docs/FLUXO-CURSOR.md`
