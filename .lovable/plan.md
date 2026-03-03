
## Plano: Corrigir duplicação de mensagens WhatsApp e identidade visual

### Problemas identificados

1. **Mensagens duplicadas (race condition)**: Quando o cliente envia "oi" e "boa noite" em sequência rápida (milissegundos de diferença), as duas chamadas do webhook chegam quase simultaneamente. Ambas consultam o cooldown antes de qualquer uma inserir o registro, então ambas passam e enviam a saudação.

2. **"tudo bem" dispara saudação no meio da conversa**: O regex atual inclui `tudo bem|td bem` como saudação, mas isso é comum no meio de uma conversa, gerando resposta automática indesejada.

3. **Ícone da Lovable no link**: Se a `store_settings.site_url` não estiver configurada, o fallback pode usar a URL do preview Lovable, que mostra o ícone/favicon da Lovable ao invés da identidade Comanda Tech.

### Solução

#### 1. Eliminar race condition com lock via banco de dados

Criar uma tabela `whatsapp_auto_reply_locks` com constraint unique em `(company_id, phone)` e usar `INSERT ... ON CONFLICT DO NOTHING` como mecanismo de lock atômico. Se o insert falhar (conflito), significa que outra instância já está processando -- skip. Um cleanup automático remove locks antigos.

**Migração SQL:**
```sql
CREATE TABLE public.whatsapp_auto_reply_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, phone)
);
ALTER TABLE public.whatsapp_auto_reply_locks ENABLE ROW LEVEL SECURITY;
```

No webhook, antes de enviar, tentar inserir na tabela de locks. Se o insert retornar `error` (conflict), abortar -- outra execução já está tratando. Após enviar e inserir em `whatsapp_messages`, deletar o lock (o cooldown de 24h em `whatsapp_messages` continua funcionando normalmente para as próximas saudações).

#### 2. Refinar detecção de saudações

Remover `tudo bem`, `td bem`, `blz`, `beleza`, `como vai` dos padrões de saudação, pois são frases comuns em conversas em andamento. Manter apenas saudações iniciais claras: `oi`, `olá`, `bom dia`, `boa tarde`, `boa noite`, `hey`, `salve`, `opa`, `eae`, etc.

#### 3. Garantir URL com identidade Comanda Tech

No `whatsapp-webhook`, garantir que o fallback final da URL seja sempre `https://appcomandatech.agilizeerp.com.br` (já está), e **nunca** use URLs do preview Lovable. Verificar se algum `store_settings.site_url` de alguma empresa está apontando para domínio Lovable e documentar que o lojista deve configurar a URL correta nas configurações.

### Arquivos a modificar

| Arquivo | Alteração |
|---|---|
| `supabase/functions/whatsapp-webhook/index.ts` | Adicionar lock atômico anti-race-condition, refinar regex de saudações, garantir fallback de URL correto |
| Nova migração SQL | Criar tabela `whatsapp_auto_reply_locks` |

### Fluxo corrigido

```text
Mensagem recebida
  → fromMe? skip
  → É saudação? (regex refinado, sem "tudo bem")
    → Não: skip
    → Sim:
      → INSERT lock (company_id, phone) ON CONFLICT DO NOTHING
        → Conflito: skip (outra execução já processando)
        → Sucesso:
          → Checar cooldown 24h em whatsapp_messages
            → Cooldown ativo: deletar lock, skip
            → Sem cooldown: enviar mensagem, registrar, deletar lock
```
