
# Correção: Pagamentos Parciais do Pedido Express

## Problema observado
No Pedido Express, quando o usuário divide o pagamento (por pessoas ou por itens) e paga apenas parte, fechando o diálogo em seguida:
- O `orders` **só é criado na última parcela** (em `finalizeExpressSplitOrder`), então não existe registro do pedido em aberto.
- O progresso (`expressSplitInfo`, `expressPaidQtys`) vive **apenas em React state**, zerando ao fechar/atualizar.
- Resultado: a venda parcial fica órfã em `pdv_sales`/`nfce_records` e o carrinho aparece inteiro novamente como pendente.

## Objetivo
Quando uma parcela for confirmada (com ou sem NFC-e), persistir o pedido em aberto e o progresso de pagamento. Ao reabrir, mostrar quanto já foi pago e quais itens foram quitados — sem mexer em TEF, NFC-e, fluxos de pedido normal, importação de mesa, ou demais módulos.

## Escopo (pontual)
Alteração isolada a:
- `src/components/PedidoExpressDialog.tsx` (handlers de split já existentes)
- 1 migration nova adicionando colunas opcionais em `orders` para guardar o progresso
- 1 ponto de leitura ao abrir o diálogo para hidratar o estado

Nada de TEF, PinPad, `pdv_sales`, `nfce_records`, `tef-webservice`, `PDVV2`, ou fluxo de “Importar e cobrar mesas” será tocado.

## Mudanças

### 1. Schema (migration)
Adicionar em `public.orders` **colunas opcionais** (nullable, sem afetar pedidos existentes):
- `paid_amount numeric default 0` — total já recebido
- `paid_items jsonb` — mapa `{ cartIndex: paidQty }` (ou equivalente) do progresso por item
- `split_info jsonb` — `{ perPerson, total, remaining }` para split por pessoas
- `payment_status text default 'unpaid'` — `'unpaid' | 'partial' | 'paid'`

Justificativa: usar `orders` (e não tabela nova) mantém a leitura barata e não cria nenhuma dependência adicional. Todas as colunas são nullable e ignoradas pelo fluxo existente.

### 2. `PedidoExpressDialog.tsx` — Criação do pedido na PRIMEIRA parcela

Hoje `addOrder(...)` só roda em `finalizeExpressSplitOrder` no fim. Mudança:
- Na primeira parcela paga de um split, criar o `orders` com:
  - status `'preparing'` (ou o atual que já existe), `payment_status='partial'`
  - `paid_amount` = valor da parcela
  - `paid_items` = itens cobrados nessa parcela
  - `split_info` = info se for split por pessoas
- Salvar o `order.id` retornado em um `useState` local `expressOpenOrderId`.
- Nas parcelas seguintes: fazer `UPDATE` em `orders` somando `paid_amount` e mesclando `paid_items`/`split_info.remaining`.
- Na última parcela: marcar `payment_status='paid'` e seguir com `finalizeExpressSplitOrder` (que hoje já faz reset/close).

Os helpers existentes (`runTefPayment`, `addSale`, `emitirNFCe`) **não mudam** — continuam sendo chamados como hoje, na mesma ordem, com os mesmos parâmetros. A única novidade é o registro/atualização do `orders` antes/depois.

### 3. Reabertura: hidratar estado a partir do `orders`

Quando o usuário abre o Pedido Express e existe um pedido com `payment_status='partial'` no caixa atual (ou via um seletor explícito), o diálogo:
- Carrega `paid_items` e `split_info` para popular `expressPaidQtys` e `expressSplitInfo`
- Marca visualmente itens já pagos como bloqueados (UI já tem `paidQty` via `checkoutItems`)

Para a primeira entrega, basta um botão simples “Continuar pedido em aberto” na tela inicial do diálogo quando houver um `orders` com `payment_status='partial'` daquele caixa — sem alterar o fluxo de criar pedido novo.

### 4. Salvaguardas
- Sem mudança em `pdv_sales`, `pdv_sale_items` ou `nfce_records`.
- Sem mudança em TEF (`runTefPayment`, `pinpadService`, `tef-webservice`).
- Pedido normal (sem split) continua usando `handleSubmit` original, intocado.
- Importar e cobrar mesa (PDV V2) intocado.
- Colunas novas nullable → migrations seguras, sem risco para dados existentes.

## Estrutura técnica resumida

```text
PedidoExpressDialog
 ├─ handleSubmitSplitPartial (existente)
 │    ├─ runTefPayment        ← inalterado
 │    ├─ addSale              ← inalterado
 │    ├─ emitirNFCe           ← inalterado
 │    └─ NOVO: createOrUpdateOpenOrder(orderId?, partial)
 │         ├─ se !orderId → INSERT orders {payment_status:'partial', paid_amount, paid_items, split_info}
 │         └─ se  orderId → UPDATE orders SET paid_amount+=, paid_items=merge, split_info.remaining-=1
 │
 ├─ finalizeExpressSplitOrder (existente)
 │    └─ NOVO: se já existe expressOpenOrderId → UPDATE orders SET payment_status='paid'
 │         em vez de INSERT duplicado
 │
 └─ NOVO ao abrir: detectar orders com payment_status='partial' do caixa
      e oferecer "Continuar pedido em aberto"
```

## Rollout
- Aplicar para todas as lojas (a mudança é aditiva e não altera fluxo de pedido normal).
- Validação manual recomendada: Bon Appetit e Lancheria I9 (que usa TEF), garantindo que (a) split por itens persiste, (b) split por pessoas persiste, (c) pedido sem split continua exatamente igual.
- Registrar em Novidades após validação.

## Fora do escopo
- Refatorar `pdv_sales` para amarrar parcelas ao pedido (não necessário para o sintoma relatado).
- Mexer em qualquer parte do PDV V2 / TEF / NFC-e.
- Alterar status visuais da lista de pedidos (apenas adicionar badge opcional “parcial” se desejado depois).
