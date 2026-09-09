# Cutover — Semana 2

Checklist para migrar definitivamente do desenvolvimento Lovable para o fluxo Cursor + VPS.

## Pré-requisitos

- [ ] Semana 1 concluída: Lovable rodando no `main`, dev local na `Cursor`
- [ ] Todas as mudanças da Lovable sincronizadas na branch `Cursor`
- [ ] Testes locais OK com Supabase externo
- [ ] CI da branch `Cursor` passando no GitHub Actions

## Passos

### 1. Sincronização final

```powershell
cd C:\xampp\htdocs\comandatech
git checkout Cursor
git fetch origin
git merge origin/main
# resolver todos os conflitos
npm run build
npm run dev   # teste manual completo
```

### 2. Merge para produção

Opção A — Pull Request (recomendado):

1. Abrir PR `Cursor → main` no GitHub
2. Revisar diff completo
3. Merge no GitHub

Opção B — Merge local:

```powershell
git checkout main
git pull origin main
git merge Cursor
git push origin main
```

O push no `main` dispara automaticamente o workflow **Deploy to VPS** (`.github/workflows/deploy-vps.yml`).

### 3. Validar produção

- [ ] Site carrega na VPS
- [ ] Login e funcionalidades críticas OK
- [ ] Supabase de produção respondendo

### 4. Descontinuar Lovable

- [ ] Parar de usar prompts na Lovable para este projeto
- [ ] (Opcional) Desconectar integração GitHub no projeto Lovable para evitar commits automáticos conflitantes

### 5. Novo fluxo permanente

```
Cursor (dev) → PR/merge → main → deploy VPS
```

- Desenvolvimento: branch `Cursor`
- Produção: merge `Cursor → main`
- Commits do PC: sempre prefixo `Cursor - `
- Deploy: só via `main`

## Rollback

Se algo der errado após o merge:

1. Reverter o merge commit no `main` ou fazer deploy de um commit anterior conhecido
2. O workflow `deploy-vps.yml` fará deploy da versão revertida no próximo push

## Contatos / referências

- Repo: https://github.com/andreghiggi/quick-jot
- VPS: `/var/www/comandatech/dist`
- Workflow deploy: `.github/workflows/deploy-vps.yml`
- Workflow CI Cursor: `.github/workflows/cursor-ci.yml`
