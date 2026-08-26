# Amore Mio — recibo + comanda automáticos no Layout V2

Escopo: somente a loja Amore Mio. Nenhuma outra loja é alterada.

## Diagnóstico (verificado)

- Configuração da loja hoje: `print_layout = v2`, `printer_paper_size = 80mm`, `auto_print_production_ticket = true`, e **não existe** `auto_print_sales`.
- Pedidos do cardápio (`Menu.tsx`) enfileiram **apenas** a comanda de produção — nenhum recibo é gerado. Por isso só sai a comanda.
- Pedido Express (`PedidoExpressDialog.tsx`) só imprime recibo no caminho "Finalizar Pedido"; no caminho normal ele cai no `else` e imprime **apenas** a comanda.
- Layout desconfigurado: em `printRouting.ts` existe um desvio exclusivo da Amore Mio que envia o HTML **cru**, sem os marcadores `HTML_START/HTML_END` que as demais lojas V2 (Bon Appetit, Império do Açaí, Rei do Açaí) usam. O script de impressão trata esse caso por outro caminho e o resultado sai fora do padrão.
- Numeração: os pedidos já têm `short_code` (ex.: `B-033`, `R-000`); a comanda usa esse código no cabeçalho (a loja já está na allowlist), mas o recibo só é gerado em fluxos que hoje não rodam.

## Correções

1. **Alinhar a Amore Mio ao padrão V2 das outras lojas**
   - Remover o desvio exclusivo da Amore Mio em `printRouting.ts` (voltar a emitir `HTML_START/HTML_END` como Bon Appetit / Império / Rei do Açaí), mantendo `print_layout = v2` e `80mm`.

2. **Recibo automático nos pedidos do cardápio**
   - Em `Menu.tsx`, após enfileirar a comanda de produção, enfileirar também o recibo V2 (`printOnlyReceipt`), passando `shortCode` do pedido, cliente, itens com adicionais agrupados, total, taxa/observações, endereço quando for entrega, `printLayout` e `paperSize` da loja.

3. **Recibo automático no Pedido Express**
   - No caminho que hoje imprime só a comanda, enfileirar também o recibo V2 com os mesmos dados (`createdShortCode`, itens, total, pagamento, endereço).
   - No caminho "Finalizar Pedido", garantir que comanda **e** recibo saiam (hoje só sai recibo), respeitando a regra de NFC-e existente.

4. **Mesmo número nos dois documentos**
   - Recibo e comanda usam sempre o `short_code` do pedido (ex.: `B-003`); fallback para `#daily_number` só quando o pedido não tiver `short_code`.

5. **Destino de impressão**
   - O recibo é enfileirado na mesma estação da comanda (quando o pedido gerar comandas em mais de uma estação, o recibo acompanha a estação padrão/principal).

## Detalhes técnicos

- Arquivos: `src/pages/Menu.tsx`, `src/components/PedidoExpressDialog.tsx`, `src/utils/printRouting.ts`.
- Reuso de `printOnlyReceipt` / `buildReceiptHTMLForCompany` (`src/utils/pdvV2Print.ts`) — sem alterar a geração V2 usada pelas outras lojas.
- Guarda por `company_id` da Amore Mio nas novas chamadas de recibo do cardápio/Express, para não mudar o comportamento das demais lojas.
- Registrar a versão nova em `src/version.ts` e na página Novidades.

## Validação

- Criar um pedido de teste pelo cardápio e outro pelo Pedido Express na Amore Mio e conferir na fila de impressão: 2 jobs (Produção + Recibo), ambos com o mesmo código (ex.: `B-003`) e HTML V2 com os marcadores padrão.
