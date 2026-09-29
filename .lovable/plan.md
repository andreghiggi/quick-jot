# Cobrança por Comanda Individual (piloto: Lancheria da I9)

## Objetivo
Cada cliente recebe uma comanda numerada (com código de barras EAN-8). O garçom lança os itens na comanda de cada pessoa. Na saída, o operador lê o código ou digita o número e cobra uma ou várias comandas de uma vez. Também dá para trazer uma parte de um item de outra comanda (ex.: 1/4 de uma pizza).

Ativado somente na Lancheria da I9 (lista de lojas liberadas, como já é feito em outros recursos). As outras lojas continuam como estão.

## O que o usuário vai ver

**1. Garçom (celular)**
- Aproveita a tela "Comandas" que já existe: abrir a comanda pelo número (digitado ou lido pela câmera) e lançar os itens. Se a comanda com aquele número não existir, ela é criada na hora e pode ser ligada a uma mesa.
- O número da comanda é único entre as comandas abertas da loja.

**2. Onde cobrar**
- Loja com Frente de Caixa ativado: novo botão "Cobrar Comanda" no Frente de Caixa.
- Loja sem Frente de Caixa: mesmo botão na tela de Mesas do PDV V2.
- Os dois abrem a mesma janela de cobrança.

**3. Janela "Cobrar Comanda"**
- Campo com foco automático: lê o código EAN-8 ou aceita o número digitado + Enter.
- Cada comanda lida entra numa lista (dá para somar várias: 12, 15, 18...), mostrando seus itens e o subtotal. Dá para tirar uma comanda da lista.
- Botão "Importar de outra comanda": escolhe a comanda de origem, o item (ex.: Pizza R$ 100,00) e a fração (1/2, 1/3, 1/4 ou N partes). A parte vai para a cobrança atual e sai da comanda de origem (a pizza fica 3/4 na comanda original).
- Total geral → abre a tela de pagamento que já existe (dinheiro, PIX, cartão, TEF, várias formas, CPF na nota, NFC-e), sem mudar nada no TEF.
- Após o pagamento: as comandas cobradas são fechadas e o número fica livre para ser usado de novo; a fração importada fica registrada nas duas comandas.

**4. Impressão das comandas (EAN-8)**
- Tela para gerar e imprimir cartões de comanda numerados (ex.: 1 a 100) com código de barras EAN-8, para a loja plastificar e reutilizar.

## Regras
- Comanda já cobrada ou fechada não pode ser lida de novo (aviso claro).
- A mesma comanda não entra duas vezes na mesma cobrança.
- Fração com arredondamento em centavos; o último pedaço fica com a sobra, para o total sempre bater (ex.: R$ 100 ÷ 3 = 33,33 + 33,33 + 33,34).
- NFC-e: usa o produto real com quantidade fracionada (0,25), já aceito pela SEFAZ no recurso "Rachar Item". Nada muda no fiscal.
- TEF congelado: só recebe o valor total, como hoje.
- Registrar no menu "Novidades" e subir a versão.

## Detalhes técnicos
- Reaproveitar `tabs` / `tab_items` (`tab_number` já existe; `quantity` já é numeric(10,3)).
- Banco (espelhar também na VPS antes de publicar, como já foi decidido):
  - índice único parcial `(company_id, tab_number) WHERE status = 'open'`;
  - `tab_items`: `source_tab_item_id uuid null` e `fraction numeric null` para marcar o pedaço importado.
- EAN-8: 7 dígitos = número da comanda com zeros à esquerda (0000012) + dígito verificador. O leitor lê como teclado + Enter; o número digitado direto também funciona.
- Novo `src/utils/comandaIndividualAllowList.ts` (I9 `8c9e7a0e-...`).
- Novo componente `ComandaChargeDialog` usado no Frente de Caixa e no `PDVV2TablesPanel`; a escolha entre um e outro segue o módulo Frente de Caixa estar ativo ou não.
- Importar fração: dentro de uma transação, diminui a quantidade/total na origem e cria o item fracionado na comanda que está sendo cobrada.
- Pagamento: montar os itens de todas as comandas escolhidas e passar para o fluxo de pagamento/venda que já existe (`pdv_sales` + `pdv_sale_items`), marcar `tab_items.paid` e fechar os `tabs`.
- Geração dos cartões: página para imprimir com códigos de barras em SVG, sem biblioteca externa.

## Fora do escopo agora
- Liberar para outras lojas (só depois de validar na I9).
- Mudanças no TEF, no fiscal ou na impressão automática.
