# Cobrança por Comanda Individual — Plano v3 (piloto: Lancheria da I9)

## O que mudou em relação ao v2
- Nova coluna `comanda_number` separada de `tab_number` (mesa x cartão). Não mexe em nenhuma comanda existente.
- Várias comandas abertas na mesma mesa passam a ser permitidas, mas só no modo cartão (hoje o sistema junta tudo numa comanda por mesa).
- Importar fração vira **reserva**: nada sai da comanda de origem antes do pagamento aprovado.
- Frações do piloto limitadas a divisões exatas (1/2, 1/4, 1/5, 1/8, 1/10), para não mexer no fiscal.
- QR da mesa: cliente só lança em comanda já aberta naquela mesa; senão o pedido fica pendente para o garçom confirmar.
- Câmera com biblioteca ZXing (funciona no iPhone), com campo digitável sempre disponível.
- Pagamento fecha tudo de uma vez só no servidor, e só depois de aprovado.
- Lacunas listadas: o que entra no piloto e o que fica de fora.

## Objetivo
Cada cliente recebe um cartão da própria loja (ex.: "026" com código de barras). O garçom lança os itens na comanda de cada pessoa. Na saída, o operador lê ou digita o número e cobra uma ou várias comandas de uma vez, podendo trazer uma parte de um item de outra comanda (ex.: 1/4 da pizza). Sem impressão de cartões.

Dupla trava: só lojas da lista (hoje a I9) **e** com a opção ligada. Todas as outras lojas continuam iguais.

## 1. Banco e número da comanda
Situação verificada (na cópia do banco na nuvem, que está parada; conferir o mesmo na VPS antes da migração):
- `tabs.tab_number` hoje é o número sequencial da comanda da mesa; não existe índice único. Nenhuma duplicidade entre comandas abertas e nenhuma mesa com duas comandas abertas.
- Hoje o sistema **não aceita** várias comandas abertas na mesma mesa: o garçom (`createTab`) e o QR (`mesa-public`) reaproveitam a comanda que já está aberta na mesa.

Proposta:
- Nova coluna `tabs.comanda_number integer null` + índice único parcial `(company_id, comanda_number) WHERE status='open' AND comanda_number IS NOT NULL`. As comandas atuais ficam com nulo, então o índice não quebra nada.
- `tab_number` continua como está (sequencial interno).
- No modo cartão, o "reaproveitar a comanda da mesa" passa a procurar por **mesa + número do cartão**; a mesma mesa pode ter 10 comandas abertas. Com a opção desligada, o comportamento de hoje fica igual.
- A mesa só fica livre quando a última comanda dela for fechada.
- Normalização: "026", "26" e "0000026" viram 26.
- Código de barras: se tiver 8 dígitos e o dígito verificador EAN-8 bater, usa os 7 primeiros sem zeros à esquerda; senão, trata como número digitado. Número inválido → aviso, nada é lançado.
- **Pendente de você:** a foto não permite ler as barras com segurança. Antes de ativar, preciso do número lido por um leitor em um cartão (ex.: o 026). Se não for `0000026` + dígito verificador, eu pergunto antes de seguir.

## 2. Importar fração com reserva
- Nova tabela `tab_item_fraction_reservations`: item de origem, comanda de destino, cobrança em andamento, numerador/denominador, valor em centavos, status (`reservada`, `confirmada`, `cancelada`, `expirada`), validade.
- Reservar não altera a comanda de origem; ela só mostra "1/4 reservado para a comanda 15".
- Confirmada só no pagamento aprovado (item 6). Cancelada ao fechar a janela, cancelar ou falhar o pagamento; expira sozinha em 15 minutos (limpeza ao abrir a janela + tarefa agendada).
- Concorrência: a reserva é feita no servidor com trava no item. Bloqueia se a soma das partes já reservadas/confirmadas passar de 100% ou se a comanda de origem estiver sendo cobrada ou já fechada. Se a origem mudar durante a cobrança, o pagamento é bloqueado com aviso antes de começar.
- Valor: cada parte guarda numerador/denominador e o valor em centavos = arredondado para baixo de (preço × parte). A **última** parte a ser confirmada (a que completa o item, seja agora ou depois) fica com a sobra, e o que resta na origem é sempre preço − partes já tiradas. O total da mesa sempre fecha.

## 3. Nota fiscal com fração
Verificado: o envio da nota arredonda o valor unitário para 2 casas e a quantidade vai com até 3 casas. O "Rachar Item" só permite 2 a 10 pessoas e grava a quantidade arredondada em 3 casas; divisões que não fecham (1/3, 1/6, 1/7) nunca foram testadas na SEFAZ — só a de 0,5 foi autorizada. Com 1/3 de R$ 100: 0,333 × 100 = 33,30 ≠ 33,33, com risco de rejeição.
Proposta sem mexer no fiscal: no piloto, só frações exatas **1/2, 1/4, 1/5, 1/8 e 1/10** (quantidade exata em 3 casas). Mesmo assim, se o preço gerar centavo quebrado (ex.: R$ 99,99 ÷ 4), a nota recebe o produto com quantidade 0,250 e o valor já calculado do item, o mesmo formato usado hoje. 1/3 e outras ficam para quando você autorizar um ajuste no envio da nota.

## 4. QR Code da mesa
- Com a opção ligada, o cliente informa mesa + número da comanda.
- Só lança direto se a comanda já estiver **aberta e ligada àquela mesa**.
- Comanda inexistente ou de outra mesa → pedido fica "pendente de confirmação do garçom" (aparece no app do garçom e no PDV com aviso). O garçom escolhe a comanda certa ou recusa.
- Comanda nova só o garçom abre.
- Garçom lançando comanda que está em outra mesa → aviso "Comanda 26 está na Mesa 3. Transferir para a Mesa 5?" — confirmar transfere (usando o histórico de transferência que já existe); cancelar não lança.

## 5. Câmera do garçom
- Biblioteca `@zxing/browser` (leitura de EAN-8 e Code128, funciona no Safari do iPhone e no Chrome do Android).
- Campo para digitar sempre visível; a câmera é um botão ao lado.

## 6. Pagamento de uma vez só
- A janela de cobrança monta o total, cria a "cobrança em andamento" e reserva as frações.
- Só depois do pagamento aprovado (TEF, PIX, dinheiro etc., fluxo atual sem mudança) roda uma função no servidor, numa única transação: cria a venda e os itens, marca os itens como pagos, confirma as frações (reduz a origem), fecha as comandas e libera a mesa se ficar vazia.
- Proteção contra repetição: a cobrança tem um identificador único; chamar duas vezes não gera segunda venda nem fecha nada de novo.
- Pagamento cancelado ou falho → nada é fechado, as reservas são canceladas, os números continuam em uso.
- A NFC-e continua sendo emitida pelo fluxo atual depois da venda criada.

## 7. Lacunas
Entram no piloto:
- **Buscar comandas abertas** por número ou mesa (cartão perdido e escolha da origem ao importar).
- **Comandas abertas sem cobrança**: aba no PDV com as comandas em aberto, há quanto tempo e o valor, destacando as que estão abertas há mais de 3 horas.
- **Impressão na cozinha/bar**: acrescentar "Comanda 026" no cabeçalho do pedido do garçom/QR, só quando a opção estiver ligada na I9 (sem mudar a impressão das outras lojas).
- **Cancelar item**: igual hoje (item ainda não pago). Item com parte reservada não pode ser cancelado.
- **Transferir comanda entre mesas**: pelo aviso do item 4 e pelo botão "Mover" que já existe.

Dependem de você:
- **Taxa de serviço/couvert**: sugestão para o piloto — calcular sobre o total da cobrança, usando a regra que a loja já usa hoje. Confirme ou diga se deve ser por comanda.

## 8. Mantido
Opção "Usar cartões de comanda individuais" desligada por padrão; dupla trava (lista + opção); sem impressão de cartões; sem mudanças no TEF e no fiscal; registro em "Novidades" e nova versão; banco espelhado na VPS antes de publicar; tarefas registradas no roadmap ao começar.

## Decisões que dependem de você
1. Enviar o número lido por um leitor de um cartão da I9 (confirma o formato do código).
2. Aprovar as frações do piloto (1/2, 1/4, 1/5, 1/8, 1/10) ou autorizar ajuste no envio da nota para permitir 1/3, 1/6 etc.
3. Taxa de serviço/couvert sobre o total da cobrança ou por comanda.
4. Tempo de expiração da reserva (sugestão 15 min) e alerta de comanda esquecida (sugestão 3 h).

## Detalhes técnicos
- Migração: `tabs.comanda_number` + índice parcial; `tab_items.source_tab_item_id`, `fraction_num`, `fraction_den`, `amount_cents`; tabela `tab_item_fraction_reservations` (GRANT + RLS por `user_belongs_to_company`); tabela `comanda_charges` (id único para evitar repetição, status); coluna `comanda_cards_enabled boolean default false` em `store_settings`; campo de pedido pendente do QR (`tab_items.pending_confirmation` ou tabela própria).
- Funções SECURITY DEFINER com `SELECT ... FOR UPDATE`: `reserve_tab_fraction`, `cancel_comanda_charge`, `finalize_comanda_charge(charge_id, payments jsonb)` — transação única, idempotente por `charge_id`.
- `useTabs.createTab` e `mesa-public`: novo caminho só quando `comanda_cards_enabled` + lista de lojas; caminho atual intacto.
- Novo `src/utils/comandaIndividualAllowList.ts`, `src/utils/comandaCode.ts` (normalização + EAN-8), `ComandaChargeDialog` no Frente de Caixa e no `PDVV2TablesPanel`.
- Pagamento reaproveita `PDVV2PaymentDialog`/`PDVV2SequentialPaymentDialog` sem alterar TEF; só troca o passo final por `finalize_comanda_charge`.
- Toda mudança de banco é aplicada também na VPS antes de publicar.

## Fora do escopo agora
- Impressão de cartões (cada loja já tem os seus).
- Frações que não fecham (1/3, 1/6, 1/7...) — depende de autorização no fiscal.
- Liberar para outras lojas (só após validar na I9).
- Mudanças no TEF, na emissão fiscal ou na impressão das outras lojas.
- Relatórios específicos por comanda individual.
