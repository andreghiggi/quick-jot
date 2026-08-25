# Sorvete continua saindo na impressora padrão (Amore Mio)

## O que foi verificado agora

- Estação cadastrada: **cozinha** → impressora `\\192.168.1.103\cozinha`.
- Vínculo: categoria **Sorvete → cozinha** (correto).
- Produto **Sorvete** está na categoria **Sorvete** (correto).
- Pedidos de teste de hoje (02:47 a 03:09): todos com origem **balcão** (Pedido Express), todos contendo o item Sorvete.
- Fila de impressão: os jobs de hoje já foram consumidos/apagados pelo script; os jobs antigos visíveis estão todos com estação vazia.

## Causa raiz

O **Pedido Express** não usa o roteamento por estação. Em `PedidoExpressDialog.tsx` a comanda é montada e inserida direto em `print_queue`, sem `station_id` e sem `job_type`. O roteamento por categoria (`enqueueProductionByStation`) só é chamado no PDV V2 (ao avançar para "preparando") e na Venda Rápida.

Ou seja: cadastro e vínculos estão certos; o fluxo usado nos testes simplesmente não passa pelo roteador — cai sempre na impressora padrão do Windows.

Os mesmos casos existem em `Menu.tsx` (cardápio online), `Waiter.tsx`, `MesaQR` e `OrderEditDialog`, que também inserem comanda direta sem estação.

## Correção em 3 etapas

1. **Pedido Express passa pelo roteador**
   Substituir a inserção direta em `print_queue` do `PedidoExpressDialog.tsx` pela chamada a `enqueueProductionByStation`, enviando os itens já com `product_id` e categoria. Assim o item de Sorvete gera um job com `station_id` = cozinha e os demais itens seguem no job padrão.

2. **Fallback seguro para as outras lojas**
   Se a loja não tiver nenhuma estação vinculada, o roteador continua gerando exatamente um job com `station_id` nulo — comportamento idêntico ao atual. Nenhuma outra loja muda de layout ou de impressora.

3. **Validação ponta a ponta na Amore Mio**
   Gerar um Pedido Express com um item de Sorvete e um item de Crepe doce e confirmar na fila que saem **dois jobs** (um com estação cozinha, outro sem estação), e que o script loga "Usando impressora mapeada" para o job da cozinha.

## Detalhes técnicos

- `PedidoExpressDialog.tsx`: manter a geração do HTML V2 atual (o roteador já reproduz o mesmo layout V2 lendo `store_settings`), trocando o `insert` por `enqueueProductionByStation(company.id, orderId, items, referência, cliente, 'balcao')`.
- Nenhuma mudança em `printProductionTicket.ts`, no `auto_printer.py` (segue v1.7.0) ou nos scripts `.cmd`.
- Etapa opcional posterior (não incluída agora): aplicar o mesmo roteamento em `Menu.tsx`, `Waiter.tsx` e `MesaQR`, loja a loja.
