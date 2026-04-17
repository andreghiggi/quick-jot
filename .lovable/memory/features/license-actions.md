---
name: License actions menu
description: Botão "Ações da licença" no detalhe da loja com Trava da revenda, Editar licença e Cancelar licença (admin master e revenda)
type: feature
---
Dentro do diálogo de detalhes da loja (StoreDetailDialog), tanto admin master quanto revendedor têm acesso ao botão "Ações da licença" com 3 opções:

- **Trava da revenda**: bloqueio imediato simples (sem agendamento). Exige motivo (60 chars), mensagem opcional (120 chars) e aceite de termos. Define `companies.license_status='blocked'` + `license_block_reason/message/blocked_at/by` e `active=false`. Permite também liberar (volta para 'active' e active=true).
- **Editar licença**: edita nome, CNPJ, telefone, e-mail, endereço e o `next_invoice_due_day` (1-28). Não altera faturas já geradas.
- **Cancelar licença**: AlertDialog com texto "Tem certeza que deseja cancelar essa licença? ..." + opções "Não cancelar licença" e "Sim, quero cancelar". Soft delete: define `license_status='canceled'` + `license_canceled_at/by` e `active=false`. Não apaga dados (mantém para eventual reativação manual).

A função `is_company_suspended` foi atualizada para retornar true também quando `license_status IN ('blocked','canceled')`.

Tela `SuspendedStoreScreen` mostra título e mensagem diferentes conforme status: 'canceled' → "Licença cancelada", 'blocked' → "Acesso bloqueado pelo revendedor" + motivo + mensagem, default → inadimplência. Sempre exibe contato WhatsApp do revendedor.

Itens de menu (Trava/Editar/Cancelar) ficam ocultos quando licença já está cancelada.
