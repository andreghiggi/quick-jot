---
name: comandatech-git-workflow
description: >-
  Gerencia o fluxo Git do ComandaTech na branch Cursor — sync com Lovable/main,
  commits prefixados, push e CI. Use ao commitar, fazer push, sincronizar branches,
  resolver conflitos Lovable vs Cursor, ou quando o usuário mencionar branch Cursor,
  GitHub Actions ou transição da Lovable.
---

# ComandaTech — Git e branch Cursor

## Contexto

| Origem | Branch | Efeito |
|--------|--------|--------|
| Lovable | `main` | Deploy VPS (produção oficial) |
| PC Cursor | `Cursor` | CI build/lint — **sem deploy** |

Repo: `andreghiggi/quick-jot` · Pasta local: `C:\xampp\htdocs\comandatech`

## Antes de cada sessão

```powershell
cd C:\xampp\htdocs\comandatech
git fetch origin
git merge origin/main
```

Resolver conflitos na `Cursor` antes de continuar.

## Commits e push

- Branch de trabalho: **`Cursor`** (nunca `main` durante transição)
- Prefixo obrigatório: **`Cursor - `**
- Push: `git push origin Cursor`

Exemplo:
```
Cursor - corrige validação de cancelamento NFC-e
```

## Workflows GitHub Actions

| Workflow | Branch | Nome nos Actions |
|----------|--------|------------------|
| `cursor-ci.yml` | `Cursor` | `Cursor - <mensagem>` |
| `deploy-vps.yml` | `main` | Deploy to VPS |

## Cutover (produção via Cursor)

Ver `docs/CUTOVER-SEMANA2.md` — merge `Cursor → main` só quando o usuário pedir cutover.

## Regras

- Não commitar `.env.local` nem `.env.backup`
- Não alterar `deploy-vps.yml` sem pedido explícito
- Commits só quando o usuário solicitar
- **Produção intocável** — ver skill `comandatech-prod-safe`
- Início de tarefa: skill `comandatech-skills-router`
