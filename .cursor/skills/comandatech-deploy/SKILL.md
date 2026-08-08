---
name: comandatech-deploy
description: >-
  Gerencia deploy e CI do ComandaTech — VPS, GitHub Actions, cutover Lovable→Cursor.
  Use ao falar de deploy, produção, VPS, Nginx, merge para main, cutover semana 2
  ou quando o usuário perguntar se mudanças na Lovable afetam produção.
---

# ComandaTech — Deploy e CI

## Produção oficial (hoje)

```
Lovable → push main → deploy-vps.yml → VPS /var/www/comandatech/dist
```

- Workflow: `.github/workflows/deploy-vps.yml`
- Build: **Bun** (`bun install --frozen-lockfile` + `bun run build`)
- Deploy: tar `dist/` → SCP → Nginx reload
- Secrets: `VPS_SSH_KEY`, `VPS_HOST`

**Mudanças na Lovable continuam atualizando produção** enquanto cutover não ocorrer.

## Branch Cursor (dev PC)

```
Push Cursor → cursor-ci.yml → build + lint (sem deploy)
```

- Workflow: `.github/workflows/cursor-ci.yml`
- Build: **npm** (Node 20)
- Lint: informativo (`continue-on-error`) — erros legados Lovable
- Título Actions: `Cursor - <commit message>`

## Local vs CI vs Produção

| Onde | Comando build | Deploy |
|------|---------------|--------|
| Local | `npm run build` | — |
| CI Cursor | `npm ci && npm run build` | Não |
| CI main/VPS | `bun run build` | Sim |

## Cutover (semana 2)

Checklist em `docs/CUTOVER-SEMANA2.md`:

1. Merge final `origin/main` → `Cursor`
2. Testes locais completos
3. PR ou merge `Cursor → main`
4. Push `main` dispara deploy VPS
5. Descontinuar Lovable

## Regras

- Não fazer push em `main` durante transição (salvo cutover autorizado)
- Não alterar secrets ou VPS sem pedido explícito
- Não force-push em `main`
