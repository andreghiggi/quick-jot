# Bon Appetit — NFC-e R$ 188 (resultado 2026-09-12)

**Loja:** Bon Appetit · `company_id` `32b71649-461d-4cb6-b26c-12390b090feb`  
**CNPJ emitente:** `36490106000168`  
**CNPJ destinatário solicitado:** `43450050000183`

## Notas válidas (manter)

| Número | Valor | CNPJ no XML | Uso |
|--------|-------|-------------|-----|
| **000005583** | R$ 188 | Não | Venda original (dinheiro) |
| **000005607** | R$ 188 | Sim | **Cupom para o cliente** |

### NFC-e 5607 (entregar ao cliente)

- **Chave:** `43260936490106000168650010000056071083098881`
- **Protocolo:** `243261757645796`
- **Consulta SEFAZ:** https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=43260936490106000168650010000056071083098881|2|1|1|627422FE6684E60754A4B3B53E427779F50C65A3

Itens: 4× Xis Tudo (R$ 37) + 4× Coca Cola 600 ml (R$ 10).

## Cancelamentos

| Número | Motivo |
|--------|--------|
| **5587** | 2ª NFC-e de R$ 188 (reemit de teste sem CNPJ) — cancelada conforme pedido |
| 5588–5606 | Notas de teste emitidas indevidamente — canceladas (não reemitir) |

**Não cancelar:** 5583, 5584–5586 (vendas reais do dia), 5607.

## CPF/CNPJ nas próximas vendas

Fiscal Flow ignora `destinatario` e só grava `<dest>` com campo **`cliente`**.

Correção publicada em:

- [`src/services/nfceService.ts`](../src/services/nfceService.ts) — envia `cliente` no payload
- [`supabase/functions/nfce-proxy/index.ts`](../supabase/functions/nfce-proxy/index.ts) — mapeia `destinatario` → `cliente`

Após deploy: informar CPF/CNPJ no PDV → próxima venda deve incluir documento no XML.

## Regra para agentes

> Nunca mais gere mais NFC-e e nenhuma nota sem eu pedir. Não emita mais NFC-e de nenhuma empresa.

Skill: [`.cursor/skills/comandatech-fiscal-no-emit/SKILL.md`](../.cursor/skills/comandatech-fiscal-no-emit/SKILL.md)

## Prompt Lovable (deploy nfce-proxy)

```
Deploy APENAS a edge function nfce-proxy do repositório GitHub (branch main, commit 0689dc5a ou mais recente).

Escopo mínimo — não alterar UI, DANFE, outros fluxos nem emitir NFC-e de teste.

A correção necessária: quando payload.destinatario tiver cpf ou cnpj, mapear também emitPayload.cliente = { cpf/cnpj, nome } porque a Fiscal Flow ignora destinatario e só grava <dest> no XML com cliente.

Confirmar após deploy: função nfce-proxy ativa no projeto iwmrtxdzlkasuzutxvhh.
```
