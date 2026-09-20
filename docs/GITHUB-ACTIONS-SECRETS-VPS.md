# GitHub Actions — secrets de produção na VPS

Atualize em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|-------|
| `VITE_SUPABASE_URL` | `https://api.comandatech.com.br` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública da API da VPS |
| `VITE_SUPABASE_PROJECT_ID` | `comandatech-vps` |

O frontend de produção usa somente `api.comandatech.com.br`. O Lovable Cloud fica preservado, sem receber operações das lojas durante a estabilização.

Após atualizar, re-run o workflow **Deploy to VPS** em `main`.

O workflow [`deploy-vps.yml`](../.github/workflows/deploy-vps.yml) falha automaticamente se:
- `VITE_SUPABASE_URL` for diferente de `https://api.comandatech.com.br`;
- a chave pública estiver ausente;
- o pacote contiver o endereço do Lovable Cloud;
- o teste após publicação falhar. Nesse caso, o pacote anterior é restaurado imediatamente.
