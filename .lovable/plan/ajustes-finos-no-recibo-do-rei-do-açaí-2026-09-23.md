# Ajustes finos no recibo do Rei do Açaí

Aplicar somente ao recibo V2 de 58 mm do Rei do Açaí, sem alterar pedidos, pagamentos, caixa, TEF ou emissão fiscal.

## Ajustes

1. **Separar cada produto**
   - Fazer a linha tracejada já gerada entre os produtos ser reconhecida pelo programa de impressão.
   - A linha ficará após todos os grupos e adicionais do produto anterior e antes do nome do próximo produto.

2. **Imprimir o troco solicitado**
   - Levar ao recibo o valor preenchido em “Troco para quanto?”.
   - Mostrar `TROCO PARA: R$ X,XX` junto ao pagamento no cabeçalho.
   - Não imprimir essa linha quando o cliente não solicitar troco.

3. **Remover subtotal redundante**
   - Quando subtotal e total forem iguais, imprimir somente `TOTAL`.
   - Manter `Subtotal`, `Entrega` e `TOTAL` quando houver taxa de entrega ou outra diferença real entre os valores.

## Validação

- Simular um pedido com dois copos e adicionais, confirmando uma linha tracejada entre eles.
- Simular pagamento em dinheiro com troco e confirmar o valor no cabeçalho.
- Validar retirada sem taxa: somente `TOTAL`.
- Validar entrega com taxa: `Subtotal`, `Entrega` e `TOTAL`.
- Atualizar a versão e registrar os ajustes no menu Novidades.

## Implantação segura

- Alteração isolada ao Rei do Açaí durante a validação.
- O programa de impressão será atualizado para reconhecer o separador entre produtos; portanto, após a publicação, a loja deverá baixar novamente o `auto_printer` e reabrir o iniciador.
- Nenhum pedido existente será reenfileirado ou reimpresso.
