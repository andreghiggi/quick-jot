---
name: Reprocess NFCe Rules
description: Reprocesso de NFC-e rejeitada deve manter o mesmo número/external_id; nunca gerar -R1 nem consumir nova numeração
type: feature
---
1. Reprocessar = mesmo número, mesmo external_id, mesma numeração fiscal. Nunca criar -R1/-R2 nem nova nota automaticamente.
2. Se a rejeição for por dado fiscal (NCM, CFOP, etc.), corrigir cadastro/payload e reenviar PUT + /reprocessar mantendo o mesmo documento.
3. Se a Fiscal Flow não permitir alterar payload mantendo número, bloquear reprocesso automático e avisar o usuário.
4. Reemissão com nova numeração só como rotina manual, excepcional, com confirmação explícita.
5. Auto-correção de NCM: só disparar quando motivo de rejeição indicar NCM inválido/inexistente. Escopo autorizado: Bon Appetit, meses 5-7 do ano corrente.
