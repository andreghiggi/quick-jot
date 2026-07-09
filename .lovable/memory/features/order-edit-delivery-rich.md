---
name: Editar Pedido — Entrega estilo cardápio
description: OrderEditDialog usa endereços salvos do cliente, campos estruturados, opções de entrega da loja e exige cliente real para "Cliente Loja → Entrega".
type: feature
---
Escopo: `src/components/OrderEditDialog.tsx` (v1.56.0-beta).

- Modalidade Entrega reaproveita `useCustomerAddresses` + `CustomerAddressPicker` (mesma UX do MenuV2) + campos estruturados (Logradouro/Número/Complemento/Bairro/Referência) + `RadioGroup` para cidade/interior no modo simples ou `Select` de bairros no modo `neighborhood`.
- `customer_id` é resolvido buscando `customers` por (company_id, phone) no open. Sem phone / nome === "Cliente Loja" → `resolvedCustomerId = null`.
- Se `resolvedCustomerId` for null e usuário trocar para Entrega, o dialog exige seleção via `FrenteCaixaCustomerDialog` (busca/cadastro). O nome/telefone escolhidos são gravados em `orders.customer_name`/`customer_phone` no save.
- Novo endereço abre um modal inline, cria via `createCustomerAddress` (padrão se cliente ainda não tem nenhum, senão adicional). No save também salva endereço "manual" ainda não selecionado.
- Taxa: `deliveryOption` = pickup | city | interior | neighborhood. Bairro fora da lista → R$ 0,00 com aviso. Retirada → 0.
- Endereço gravado em `orders.delivery_address` no formato "Logradouro, Número - Complemento - Bairro | Ref: X" (mesmo do cardápio).
- `buildUpdatedReceiptHtml` já recebia endereço/taxa; o recibo do motoboy sai automaticamente. WhatsApp e comanda de produção continuam intocados.
- Não altera PDV V2, Pedido Express, Cobrança, TEF, PinPad, NFC-e, impressão fora do dialog nem backend/RLS.