# GitHub Actions — secrets de produção (rollback Lovable)

Atualize em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|-------|
| `VITE_SUPABASE_URL` | `https://iwmrtxdzlkasuzutxvhh.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key Lovable (Dashboard → API) |
| `VITE_SUPABASE_PROJECT_ID` | `iwmrtxdzlkasuzutxvhh` |

**Não usar** `api.comandatech.com.br` no frontend (VPS API descomissionada após rollback).

Após atualizar, re-run o workflow **Deploy to VPS** em `main`.

O workflow [`deploy-vps.yml`](../.github/workflows/deploy-vps.yml) falha automaticamente se:
- `VITE_SUPABASE_URL` contiver `api.comandatech.com.br`
- o bundle gerado não contiver `iwmrtxdzlkasuzutxvhh`
