---
name: Frente de Caixa — Cliente picker
description: Etapa 2 Cliente do checkout da Frente de Caixa usa modal dedicado (busca por CPF/nome/telefone + cadastro inline), estilo Gweb. CPF flui normalmente para NFC-e.
type: feature
---
- Arquivo: `src/components/frente-caixa/FrenteCaixaCustomerDialog.tsx`. Montado dentro do `FrenteCaixaCheckoutDialog`.
- Etapa 2 começa colapsada: "Nenhum cliente vinculado" + botão `INFORMAR CLIENTE`. Quando vinculado, mostra chip com Alterar/Remover.
- Modal tem 2 modos: `search` (campo único, debounce 280ms, `or(phone.ilike,cpf.ilike,name.ilike)` quando dígitos ≥3, senão só nome) e `create` (Nome obrigatório, Telefone obrigatório, CPF opcional → `INSERT` em `customers`).
- Atalho "Usar X como CPF/CNPJ no cupom" aparece quando query tem 11+ dígitos e busca não retorna nada — só preenche `customerDocument`, sem cadastrar.
- Atalhos A–Z / Ctrl+1/2/3 / Home / Esc do checkout ficam suspensos enquanto `customerDialogOpen=true` (flag adicionada ao handler).
- CPF/Telefone continuam fluindo para `runMultiPayment` → `nfce-proxy` exatamente como antes. Nada de PDV V2, Pedido Express, OrderCardChargeDialog, TEF ou impressão foi alterado.
- Introduzido em 1.18.2-beta.
