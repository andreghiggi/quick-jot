# Bon Appetit — correção definitiva da tela que não abre

## Problema confirmado

**Do I know what the issue is? Sim.**

A tela recebe um pedido em uma situação que ela própria grava como **cancelado**, mas só sabe mostrar pedidos pendentes, em preparo, prontos ou entregues. Ao tentar escolher a cor do pedido cancelado, não encontra essa informação e derruba a tela inteira.

A nova imagem mostra exatamente essa falha. O trecho publicado também confirma que a quebra acontece ao montar o cartão de um pedido cuja situação não tem aparência definida.

Isso explica por que o site abre, mas a área da Bon Appetit cai depois de entrar: o problema aparece quando os pedidos dessa loja são carregados. Não é cache, aparelho, internet, banco fora do ar ou carregamento separado do PDV.

## Solução de menor risco

1. Ensinar a tela a reconhecer e mostrar corretamente pedidos cancelados.
2. Considerar cancelado tanto pela situação do pedido quanto pela marcação já existente nas observações.
3. Adicionar uma proteção: se algum pedido antigo tiver outra situação inesperada, ele será mostrado de forma neutra, sem derrubar a tela.
4. Ajustar a lista de situações aceitas para que o mesmo erro não volte em futuras alterações.
5. Testar a abertura autenticada da Bon Appetit com os pedidos reais em Safari/iPhone e Chromium, apenas visualizando as telas.
6. Publicar a correção na VPS com retorno automático se a validação falhar.
7. Confirmar no endereço de produção que a Bon Appetit abre e registrar a correção em Novidades.

## Limites de segurança

- Nenhum pedido será apagado ou modificado.
- Nenhuma venda, caixa ou configuração de loja será alterada.
- Nenhuma impressão será disparada.
- Nenhum pagamento, TEF ou PinPad será executado.
- Nenhuma nota fiscal será emitida, cancelada, reemitida ou inutilizada.
- As demais lojas continuarão funcionando durante a correção.
