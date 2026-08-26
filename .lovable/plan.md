# Pedido Express mobile — fluxo exclusivo Amore Mio

## 1. Teclado abrindo sozinho (todas as lojas)

Ao abrir o Pedido Express, o diálogo entrega o foco ao primeiro campo focável, que é a busca de produtos — no celular isso abre o teclado e cobre o catálogo. Correção: impedir o foco automático na abertura do diálogo principal (o diálogo de detalhe do produto já faz isso).

## 2. Novo fluxo Amore Mio (só para essa loja)

Sequência desejada:

```text
1. Seleciona produto(s)
2. Seleciona cliente (Cliente Loja ou telefone/nome)
3. Abre direto o COBRAR (pagamento)
4. Pago -> aparece "Enviar para Cozinha"
5. Imprime recibo + comanda de produção (mesmo número B-00X)
6. Pedido nasce/vai direto para a aba "Entregues" e o valor entra no caixa
```

Como será implementado:

- Etapas de Entrega e Pagamento deixam de ser navegadas manualmente na Amore Mio: após escolher o cliente, o app abre automaticamente o diálogo de cobrança (o mesmo já usado hoje em "Finalizar Pedido").
- Concluída a cobrança, o pedido ainda não é criado: o diálogo volta ao resumo com o pagamento marcado como quitado e um único botão em destaque "Enviar para Cozinha".
- Ao clicar em "Enviar para Cozinha": cria o pedido já com pagamento quitado e status entregue, registra a venda no caixa (mesmo registro em `pdv_sales` usado hoje) e enfileira as duas impressões — recibo e comanda de produção — com o mesmo código curto.
- Sem cobrança concluída, o botão "Enviar para Cozinha" fica bloqueado.
- Os botões atuais "Finalizar Pedido" / "Enviar para Cozinha" lado a lado continuam iguais nas demais lojas.

## 3. Escopo e segurança

- Todas as mudanças de fluxo ficam atrás do ID da Amore Mio; nenhuma outra loja muda de comportamento.
- Nada de TEF, NFC-e, roteamento de impressão por estação ou layout V2 é alterado — apenas a ordem das etapas e o momento em que o pedido é gravado.
- Único ajuste global: o teclado não abrir automaticamente ao abrir o Pedido Express.

## Detalhes técnicos

- `src/components/PedidoExpressDialog.tsx`
  - `DialogContent` principal recebe `onOpenAutoFocus={(e) => e.preventDefault()}`.
  - Novo flag `isAmoreMio = company?.id === 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8'`.
  - `goNext()`: na Amore Mio, ao concluir a etapa de cliente (nome), pular Entrega/Pagamento (`deliveryType = 'retirada'`) e abrir `pickupChargeOpen`.
  - `onConfirm` do checkout na Amore Mio: em vez de chamar `handleSubmit({ finalizeNow: true })`, gravar em estado local (`amoreChargeResult`) o método/valor/desconto/opções fiscais e fechar o diálogo de cobrança.
  - Rodapé da etapa 5 na Amore Mio: um botão "👨‍🍳 Enviar para Cozinha", habilitado só com `amoreChargeResult`, que chama `handleSubmit({ ...amoreChargeResult, finalizeNow: true })`.
  - O caminho `finalizeNow` na Amore Mio já imprime recibo + comanda com o mesmo `short_code` — mantido.
- Multi-pagamento (dividir formas) segue o mesmo padrão: resultado guardado e liberado no envio.
- Versão: subir para `1.69.0-beta` em `src/version.ts` com entrada no changelog.
