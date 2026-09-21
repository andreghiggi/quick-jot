# Restaurar a Bon Appetit agora — publicar a correção que não chegou à loja

## Causa confirmada

- O sistema usado pela Bon Appetit ainda entrega o arquivo antigo `index-ClODmcty.js`.
- Esse arquivo antigo tenta buscar a aparência do pedido pela situação e usa o resultado sem conferir se ele existe. Quando chega um pedido `cancelado`, a aparência não é encontrada e a Dashboard cai exatamente em `borderRadius`.
- A correção **1.72.5-beta** já está no código principal e inclui `Cancelado` e uma aparência neutra de segurança, mas **não está no arquivo servido em produção**.
- Portanto, o erro persiste porque a correção não foi efetivamente publicada, não porque os pedidos da Bon Appetit mudaram ou porque a explicação anterior estava errada.

## Correção imediata

1. Publicar na VPS o código principal atual, versão **1.72.5-beta**, apontando somente para `api.comandatech.com.br`.
2. Confirmar no arquivo realmente entregue por `app.comandatech.com.br` que estão presentes:
   - a versão 1.72.5-beta;
   - a aparência de pedido cancelado;
   - a proteção neutra para qualquer situação inesperada.
3. Abrir a Bon Appetit com sessão autenticada e aguardar o carregamento completo dos pedidos, reproduzindo o momento em que a tela caía.
4. Validar em navegador de computador e no formato de iPhone/Safari que a Dashboard permanece aberta depois que os pedidos aparecem.
5. Se qualquer validação falhar, retornar automaticamente à versão anterior e não manter uma publicação quebrada.

## Limites de segurança

- Não alterar, apagar ou regravar nenhum pedido.
- Não alterar vendas, caixas, cardápio, impressão ou configurações da Bon Appetit.
- Não tocar em TEF, PinPad, NFC-e, NF-e ou numeração fiscal.
- Não parar nem alterar as demais lojas.
- Confirmar a versão realmente entregue pela produção antes de declarar resolvido.
