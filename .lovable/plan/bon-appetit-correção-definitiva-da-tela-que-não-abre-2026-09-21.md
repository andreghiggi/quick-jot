# Bon Appetit — correção definitiva da tela que não abre

## Problema confirmado

**Do I know what the issue is? Sim.**

A Dashboard aparece por cerca de um segundo porque sua estrutura termina de abrir antes da lista de pedidos. Assim que os pedidos chegam, a tela recebe a situação **cancelado**, mas só sabe mostrar pedidos pendentes, em preparo, prontos ou entregues. Ao tentar escolher a cor do pedido cancelado, não encontra essa informação e derruba a tela inteira.

A nova imagem mostra exatamente essa falha na escolha da cor. O trecho publicado confirma que a quebra acontece ao montar o cartão do pedido. A consulta somente de leitura confirmou **87 pedidos cancelados na Bon Appetit**; nenhum deles será alterado.

Isso explica exatamente o comportamento informado: a Dashboard aparece, os pedidos terminam de carregar e então a tela cai. Sempre funcionou porque essa falha antiga só aparece quando a lista atual contém uma situação que a tela ainda não sabe desenhar; o primeiro pedido assim expôs o defeito. Não é cache, aparelho, internet, banco fora do ar ou carregamento separado do PDV.

## Como será corrigido

1. **Ensinar a tela a exibir pedido cancelado.** Ele passa a ter nome e aparência próprios, como já acontece com pendente, em preparo, pronto e entregue.
2. **Reconhecer o cancelamento pela situação do pedido**, e não apenas pela observação escrita. Hoje, um pedido cancelado sem essa observação é exatamente o que derruba a tela.
3. **Rede de segurança definitiva.** Se aparecer qualquer outra situação desconhecida, hoje ou no futuro, o pedido será mostrado de forma neutra em cinza. A tela nunca mais poderá cair por causa disso.
4. **Aplicar o mesmo cuidado nas demais listas de pedidos** (Dashboard, PDV e abas), para não corrigir só um ponto.

### Por que isso resolve de fato

A queda acontece em um único momento: escolher a aparência do pedido. Com o item 3, esse momento deixa de ter qualquer possibilidade de falta de informação — não existe mais situação sem aparência. Os itens 1 e 2 fazem o cancelado aparecer corretamente, em vez de apenas não quebrar.

### Validação antes de liberar

5. Abrir a Bon Appetit autenticada, com os 87 pedidos cancelados reais, em iPhone/Safari e no computador, apenas visualizando.
6. Confirmar que a Dashboard permanece aberta e que os pedidos cancelados aparecem identificados.
7. Publicar com retorno automático à versão anterior se a verificação falhar, conferir em produção e registrar em Novidades.

## Limites de segurança

- Nenhum pedido será apagado ou modificado.
- Nenhuma venda, caixa ou configuração de loja será alterada.
- Nenhuma impressão será disparada.
- Nenhum pagamento, TEF ou PinPad será executado.
- Nenhuma nota fiscal será emitida, cancelada, reemitida ou inutilizada.
- As demais lojas continuarão funcionando durante a correção.
