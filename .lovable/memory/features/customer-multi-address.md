---
name: Customer multi-address
description: Cardápio online suporta múltiplos endereços por cliente via tabela customer_addresses; UX e auto-fill atuais preservados.
type: feature
---
Tabela `customer_addresses` (FK customer_id → customers, CASCADE) com label/address/number/complement/neighborhood/reference/city/state/is_default. RLS pública (mesmo padrão de `customers`) + policy para empresa. Backfill migrou endereços existentes como `is_default=true`.

Hook `useCustomerAddresses(customerId, companyId)` em src/hooks/useCustomerAddresses.ts. Componente `CustomerAddressPicker` em src/components/menu/CustomerAddressPicker.tsx (seletor + modal Gerenciar com tornar padrão / excluir).

Integração em src/pages/Menu.tsx: o auto-fill original de `customers.address` foi mantido intacto; o picker é ADITIVO e só aparece quando o customer tem ≥1 endereço salvo. No submit, além do upsert original em `customers`, salva/atualiza `customer_addresses` (best-effort, não bloqueia). Nenhum outro fluxo (Pedido Express, PDV V2, NFC-e, impressão) lê essa tabela.
