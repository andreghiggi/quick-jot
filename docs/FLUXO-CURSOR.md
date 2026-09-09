# Fluxo de trabalho — branch Cursor

Este documento descreve o fluxo diário durante a **semana de transição** (Lovable no `main`, desenvolvimento local na `Cursor`).

## Quem faz o quê

| Origem | Branch | Resultado |
|--------|--------|-----------|
| Lovable | `main` | Deploy automático na VPS |
| PC Cursor | `Cursor` | CI build/lint — **sem deploy** |

## Antes de cada sessão de dev

```powershell
cd C:\xampp\htdocs\comandatech
git fetch origin
git merge origin/main
# resolver conflitos se houver
npm run dev
```

## Durante o desenvolvimento

1. Trabalhe na branch `Cursor`
2. Teste em http://localhost:8080
3. Use `.env.local` com Supabase externo (não commitar)

## Ao finalizar uma tarefa

```powershell
git add .
git commit -m "Cursor - descrição da mudança"
git push origin Cursor
```

## Regra de ouro

**Nunca commitar direto no `main` a partir deste PC** durante a transição. Tudo passa pela branch `Cursor`.

## GitHub Actions

- Push na `Cursor` → workflow **Cursor CI** com título `Cursor - <mensagem do commit>`
- Push no `main` (Lovable) → workflow **Deploy to VPS** (produção)

## Cutover (semana 2)

Ver [docs/CUTOVER-SEMANA2.md](./CUTOVER-SEMANA2.md).

## Skills e backup auth

- Roteamento de skills: `.cursor/skills/comandatech-skills-router/`
- Produção intocável: `.cursor/skills/comandatech-prod-safe/`
- Espelhar login Lovable → externo: [docs/BACKUP-AUTH-MIRROR.md](./BACKUP-AUTH-MIRROR.md) → `npm run mirror-auth`
