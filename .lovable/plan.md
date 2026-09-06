# Bon Appétit — diagnóstico e correções seguras

Verificação feita somente na loja Lancheria Bon Appetit. Nenhuma alteração aplicada ainda.

## O que foi encontrado (confirmado nos dados)

### 1. Item adicionado na cobrança que não foi cobrado — CAUSA CONFIRMADA
No pedido R-454 (03/09) o cliente tinha 3 itens (R$ 65). Durante a cobrança foram adicionados dois refrigerantes de R$ 16, mas o pedido fechou em R$ 81 (só um deles) — ficou R$ 16 sem cobrar. O mesmo padrão aconteceu no B-011 (19/08, R$ 7 a menos). São 2 casos em 30 dias.

Motivo: na tela de cobrança, o item extra é gravado no pedido **antes** do pagamento acontecer. Se o pagamento não conclui (cancelamento no pinpad, erro, operador fecha a tela), o item já ficou pendurado no pedido e nunca é cobrado. Ao repetir a cobrança, o operador adiciona o item de novo e o sistema soma apenas o extra da nova tentativa.

### 2. Fechamento de caixa errado — DUAS CAUSAS
- Em **todos** os fechamentos dos últimos 10 dias o valor contado pelo operador foi gravado como R$ 0,00, enquanto o sistema esperava R$ 1.071, R$ 1.776, R$ 7.299 etc. Resultado: diferença negativa gigante em todo relatório. Hoje o campo "valor em caixa" aceita ficar vazio e vira zero sem nenhum aviso.
- O caixa fica aberto atravessando dias (ex.: aberto 03/09 20h, fechado 05/09 02h), então um único fechamento junta as vendas de dois dias.

### 3. TEF um pouco lento
O pinpad responde rápido na média (cerca de 0,1 s por consulta), mas há picos isolados de 4 s, 10 s e até 14 s. O que realmente segura a impressão é a nota fiscal: existem 10 notas paradas em "processando" (a mais antiga de 24/08) e o comprovante hoje só sai depois da nota resolver. A Cozinha da Ruiva já está no piloto que imprime o comprovante do cartão na hora; a Bon Appétit ainda não.

### 4. Impressão
Fila de impressão está limpa (0 pendências, 4.612 já impressas) e a loja está no layout V2 / 80 mm, igual às demais. Não dá para apontar o defeito sem ver o que saiu errado — preciso da foto/print que eles enviaram ontem.

## Correções propostas (só Bon Appétit, sem tocar em TEF, nota fiscal ou impressão existente)

1. **Item extra só entra depois do pagamento aprovado.** Mudar a ordem na tela de cobrança: grava o item extra apenas quando o pagamento é concluído. Se o pagamento for cancelado, nada fica pendurado no pedido. Vale para qualquer loja, é correção de ordem de operação — sem mexer no pinpad nem na emissão da nota.
2. **Aviso ao adicionar item já existente**: se o pedido já tem um item igual marcado como "adicionado depois", mostrar um alerta antes de duplicar.
3. **Fechamento de caixa**: exigir o valor contado (não deixar confirmar em branco/zero) e mostrar em destaque o valor esperado antes de confirmar. Nada muda no cálculo, só na conferência.
4. **Aviso de caixa aberto há mais de um dia** na tela do caixa, para lembrar de fechar no fim do turno.
5. **Comprovante do cartão na hora** (mesmo piloto da Cozinha da Ruiva): incluir a Bon Appétit na lista, se eles usarem a Frente de Caixa. Isso resolve a sensação de lentidão sem alterar nada da nota fiscal.
6. **Notas em "processando"**: reconciliar as 10 pendentes pelo Monitor NFC-e, sem gerar numeração nova.
7. Corrigir manualmente os dois pedidos cobrados a menos, se você quiser (R$ 16 e R$ 7) — ou deixar como está.

## Fora de escopo / travado
- `tef-webservice`, `pinpadService`, `pdvV2Tef`, `tefOrderActions`, `nfce-proxy` (timeouts, contingência, idempotência, numeração): nada será alterado.
- Layout e roteamento de impressão: nada será alterado até você mandar a imagem do erro.
- Nenhuma outra loja é afetada; os ajustes 3, 4 e 5 ficam limitados ao ID da Bon Appétit.

## Detalhes técnicos
- `src/components/OrderCardChargeDialog.tsx`: mover o `insert` em `order_items` (extras, `added_after: true`) para depois do `runTefPayment`/`addSale` bem-sucedido; manter `orderUpdate.total = baseTotalAfterExtras`.
- `src/components/pdv-v2/PDVV2CloseCashDialog.tsx`: bloquear `handleConfirm` com valor vazio/zero (guardado por ID da empresa) e destacar o esperado.
- `src/utils/frenteCaixaTefEarlyPrint.ts`: adicionar `32b71649-461d-4cb6-b26c-12390b090feb` ao piloto, se confirmado o uso da Frente de Caixa.
- Versão para `1.71.1-beta` + registro em Novidades.

## Preciso de você
- A foto/print da impressão errada e da "tela errada" de ontem.
- Confirmar se a Bon Appétit cobra pela Frente de Caixa ou pelo card do pedido (os registros indicam cobrança pelo pedido).
