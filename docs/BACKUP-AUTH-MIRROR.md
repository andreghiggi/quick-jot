# Espelhamento Auth — Lovable → Supabase externo

O backup diário agora inclui **`auth.users`** e **`auth.identities`**, preservando `encrypted_password` para login funcionar no espelho com as mesmas credenciais da produção.

## O que muda

| Antes | Depois |
|-------|--------|
| Só schema `public` | `auth` + `public` |
| Login no externo não funcionava | Mesmo email/senha da Lovable |

## Regra de ouro — produção intocada

- **Origem (Lovable):** somente **SELECT** (leitura)
- **Destino (externo):** DELETE + INSERT/UPSERT
- **Nenhum** UPDATE/DELETE na origem
- Código na branch **`Cursor`** — **não deployar** edge function na Lovable até você pedir

## Sincronização manual (recomendado agora)

Sem deploy em produção. Rode do PC:

### 1. Criar `.env.backup`

```powershell
copy .env.backup.example .env.backup
```

Preencha com as connection strings postgres (Dashboard → Settings → Database → URI):

- `SOURCE_DB_URL` → projeto **iwmrtxdzlkasuzutxvhh** (Lovable)
- `TARGET_DB_URL` → projeto **vyotbtmnnosiejyltlxc** (externo)

### 2. Instalar dependência e espelhar auth

```powershell
npm install
npm run mirror-auth
```

### 3. Espelhar dados public (opcional — se desatualizado)

O cron diário já espelha `public`. Para forçar resync completo do public, use o script existente **no sandbox Lovable** (quando autorizado):

```bash
bash scripts/backup_resync.sh
```

### 4. Testar login local

```powershell
npm run dev
```

Acesse http://localhost:8080/auth com usuário da produção.

## Quando deployar na Lovable (somente quando você pedir)

Após merge/deploy da edge function `backup-mirror` na Lovable, o cron **03:00 BRT** passará a incluir auth automaticamente.

Modos da edge function:

| mode | Ação |
|------|------|
| (padrão) | auth + public |
| `auth-only` | só auth |
| `skip_auth: true` | só public (legado) |
| `health` | testa conexões |

Exemplo auth-only (requer deploy + secret):

```bash
curl -X POST "https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/backup-mirror" \
  -H "Content-Type: application/json" \
  -H "x-backup-secret: SEU_SECRET" \
  -d '{"mode":"auth-only"}'
```

## Limitações

- Sessões OAuth/social: providers precisam estar configurados no externo
- `auth.sessions` / refresh tokens: **não** copiados (usuário faz login de novo)
- Storage (imagens): backup separado, não incluído

## Arquivos

- `supabase/functions/backup-mirror/mirror-auth.ts` — lógica compartilhada
- `scripts/mirror-auth.mjs` — sync local sem deploy
- `.env.backup.example` — template de credenciais postgres
