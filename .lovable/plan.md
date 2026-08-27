# Pedido Express: + / - na quantidade + badge de modalidade no cardápio

## Situação atual (verificada)

No diálogo do Pedido Express, o resumo do carrinho mostra cada item apenas como "2x Produto" com um "X" para remover. Não existe nenhum controle de mais/menos — para repetir um item o operador precisa voltar à lista e selecionar o produto de novo.

Os controles de + / - que existem hoje nesse diálogo são apenas para quantidade de adicionais dentro de um grupo (e só na Lancheria I9), não para o item do carrinho.

A função que altera a quantidade de um item do carrinho já existe no arquivo (`updateCartQuantity`), mas não está ligada a nenhum botão.

## O que será feito

No Pedido Express da Amore Mio, cada linha do carrinho passa a ter:

```text
[X]  [-]  2  [+]   Açaí 500ml            R$ 24,00
```

- Botão "-" reduz 1; ao chegar em zero o item sai do carrinho.
- Botão "+" soma 1.
- O total do pedido, o contador de itens e o badge "n no carrinho" na lista de produtos acompanham na hora.
- Adicionais, observações e agrupamentos do item são mantidos ao alterar a quantidade.

Locais onde os botões aparecem:
1. Resumo do carrinho no passo de seleção de produtos.
2. Lista "Produtos" na tela de revisão/cobrança — nesse ponto, itens já pagos parcialmente (fluxo de pagamento parcial) não recebem os botões, para não desalinhar o que já foi cobrado.

Escopo: alteração exclusiva da Amore Mio (mesmo padrão dos demais ajustes recentes). As outras lojas continuam com o resumo atual, sem nenhuma mudança.

## Detalhes técnicos

- Arquivo único: `src/components/PedidoExpressDialog.tsx`.
- Reutilizar `updateCartQuantity(index, delta)` (já implementada, remove o item ao zerar).
- Renderizar os botões condicionados a `isAmoreMio`; no bloco de revisão, também condicionar a `paidQty === 0`.
- Botões `size="icon"` `variant="outline"` `h-7 w-7` com ícones `Minus`/`Plus` já importados, com `e.stopPropagation()`.
- Sem mudanças em banco, impressão, cobrança, status do pedido ou WhatsApp.
- Subir versão para 1.70.3-beta e registrar no changelog.

---

## Parte 2 — Cardápio: não mostrar "Entrega" quando a loja não faz delivery

Situação verificada: no cabeçalho do cardápio a faixa verde é fixa — sempre exibe "🛵 Entrega · 🤲 Retirada: {tempo}", sem olhar as modalidades da loja. A Amore Mio está hoje com entrega desativada (`enable_delivery = false`) e mesmo assim aparece "Entrega" para o cliente.

O que será feito (vale para qualquer loja, é uma correção da regra existente):

- Loja só com retirada: `🤲 Retirada: 40-60`
- Loja só com entrega: `🛵 Entrega: 40-60`
- Loja com as duas: continua `🛵 Entrega · 🤲 Retirada: 40-60`
- Loja sem nenhuma das duas: mostra apenas o tempo estimado.

### Detalhes técnicos (parte 2)

- Arquivo: `src/components/menu/MenuV2.tsx`, badge do cabeçalho.
- Usar `settings.enableDelivery` e `settings.enablePickup`, já carregados por `useStoreSettings` (`enable_delivery` / `enable_pickup`, default `true`).
- Montar o rótulo dinamicamente; nenhuma mudança em fluxo de checkout, que já respeita as modalidades.
