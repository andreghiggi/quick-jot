---
name: comandatech-skills-router
description: >-
  Roteia tarefas ComandaTech para as skills corretas. Use no início de qualquer prompt
  ou tarefa neste projeto para carregar as skills relevantes antes de implementar.
---

# ComandaTech — Roteador de Skills

Ao receber uma tarefa, **leia as skills listadas abaixo** antes de agir.

## Mapa prompt → skills

| Tipo de tarefa | Skills a usar |
|----------------|---------------|
| Commit, push, branch, sync Lovable | `comandatech-git-workflow` |
| npm run dev, .env, localhost, reiniciar servidor | `comandatech-local-dev` |
| Nova feature, componente, rota, PDV, pedidos | `comandatech-architecture` |
| Supabase, migration, edge function, query, auth | `comandatech-supabase` |
| Deploy, VPS, CI, cutover, produção vs Cursor | `comandatech-deploy` |
| Backup, espelho, mirror-auth, login no externo | `comandatech-supabase` + `docs/BACKUP-AUTH-MIRROR.md` |
| **Qualquer alteração que possa afetar produção** | `comandatech-prod-safe` (**sempre**) |

## Regra padrão

1. **`comandatech-prod-safe`** — assume produção intocável até o usuário pedir o contrário
2. **`comandatech-git-workflow`** — branch Cursor, commits `Cursor - `
3. Skill de domínio conforme a tabela acima

## Skills disponíveis (`.cursor/skills/`)

- `comandatech-git-workflow`
- `comandatech-local-dev`
- `comandatech-architecture`
- `comandatech-supabase`
- `comandatech-deploy`
- `comandatech-prod-safe`
- `comandatech-skills-router` (este arquivo)

## Regra Cursor (automática)

`.cursor/rules/comandatech-cursor.mdc` — branch, commits, ambiente local.

## Associação em prompts do usuário

Quando o usuário disser "associe as skills", carregar roteador + skills da tabela para o escopo da tarefa.
