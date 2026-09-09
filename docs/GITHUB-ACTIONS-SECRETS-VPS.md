# GitHub Actions — secrets de produção VPS

Atualize em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|-------|
| `VITE_SUPABASE_URL` | `https://api.comandatech.com.br` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4ODgzMDk1OSwiZXhwIjoyMTA0MTkwOTU5LCJyb2xlIjoiYW5vbiJ9.d7XOE2KQm-SIDaaYEGrKDNBq8mzixU9I3EHyVGRq-_k` (VPS `ANON_KEY`) |
| `VITE_SUPABASE_PROJECT_ID` | `comandatech-vps` |

**Não usar** `iwmrtxdzlkasuzutxvhh.supabase.co` (Lovable Cloud — DNS inexistente).

Após atualizar, re-run o workflow **Deploy to VPS** em `main`.

O workflow [`deploy-vps.yml`](../.github/workflows/deploy-vps.yml) falha automaticamente se:
- `VITE_SUPABASE_URL` contiver Lovable/`supabase.co`
- o bundle gerado contiver `iwmrtxdzlkasuzutxvhh`
