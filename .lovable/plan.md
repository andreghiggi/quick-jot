# Rei do Açaí (impressão) + CPF/CNPJ opcional no PDV V2

## 1) Rei do Açaí — por que o recibo sai "sem desenho"

### O que eu verifiquei
- A loja está configurada como **Layout V2**, papel **58mm**.
- O recibo que o sistema mandou hoje às 17:55 (Recibo D-392) **já foi gerado no modelo bonito**: tem a faixa de entrega/retirada, os títulos dos grupos de complementos e os blocos de itens.
- A versão do sistema que está no ar é a atual.

Ou seja: **o sistema está mandando o recibo certo**. O que sai plano no papel é culpa do programinha de impressão instalado no computador da loja.

### Explicando simples
O programinha que fica rodando no PC da loja pode imprimir de dois jeitos:

- **Jeito bonito (desenho):** ele "pinta" o papel. É assim que aparecem a caixa em volta do cabeçalho, o texto branco no fundo preto, o negrito e as linhas tracejadas.
- **Jeito simples (texto):** ele manda só as letras, sem nenhum enfeite. É exatamente o que está saindo hoje no Rei do Açaí.

Ele só usa o jeito bonito quando três coisas estão certas no computador:
1. o programinha é a versão nova — **confirmado nas suas fotos: v1.7.8, ativo e monitorando**;
2. o número de identificação da loja está gravado na pasta — **confirmado: o `company_id.txt` está com o código certo do Rei do Açaí**;
3. o complemento do Windows que permite "pintar" o papel (o `win32ui`) está instalado e funcionando — **é o único item que ainda falta confirmar**.

Como os dois primeiros estão certos, a explicação que sobra é a terceira: o complemento do Windows falha, o programinha percebe isso e, para não deixar o pedido sem sair, imprime no jeito simples. Por isso sai tudo plano, sem caixa e sem inversão.

### O que preciso que você me envie (é só isso)
1. Na mesma pasta do programinha, dar dois cliques em **`verificar_pywin32.py`** (ou abrir o Prompt na pasta e rodar `python verificar_pywin32.py`) e me mandar a tela. A linha que interessa é **"win32ui: OK"** ou **"win32ui: AVISO"**.
2. Se for mais fácil, me mande também o arquivo **`printer_log.txt`** da pasta — nele aparece a mensagem "Modo GDI ignorado" toda vez que ele cai no jeito simples.

### Passo a passo depois disso
1. Se o complemento estiver falhando: rodar o **`instalar_impressao.cmd` como administrador**, reiniciar o Windows e abrir o programinha de novo.
2. Mandar **uma folha de teste** (não vamos reimprimir pedidos antigos).
3. Comparar com o modelo da foto e confirmar.


### Melhoria que vou aplicar no programinha
- Quando o jeito bonito não estiver disponível, ele passa a usar os recursos da própria impressora para pelo menos manter **negrito e texto invertido**, em vez de sair tudo plano.
- E avisa na tela, ao abrir, que está no jeito simples — assim ninguém mais descobre pelo papel.

## 2) PDV V2 — botão opcional "Informar CPF/CNPJ"

### Situação de hoje
No Frente de Caixa existe "Informar cliente", onde dá para digitar CPF/CNPJ antes da nota. No PDV V2 não existe esse campo visível: a pergunta de CPF só aparece em alguns caminhos e, quando o pagamento é na maquininha, o sistema cobra o cartão e emite a nota direto, sem perguntar nada. Por isso a Bon Appetit relatou que "sumiu o botão".

Lojas com nota fiscal ativa hoje: Bon Appetit, Lancheria da i9, Cozinha da Ruiva e Margen Pizzaria. As quatro usam maquininha, então as quatro caem nesse caminho sem pergunta.

### O que será feito
- Na própria tela de cobrança do PDV V2 (a mesma de hoje, sem mudar o fluxo), acrescentar um botão discreto **"+ Informar CPF/CNPJ (opcional)"**, logo acima do botão de confirmar pagamento.
- Ao clicar, abre um campinho para digitar; ao lado, um link para remover. O que for digitado vai para o destinatário da nota.
- **Nada trava:** se o operador não informar nada, a venda segue igual a hoje e a nota sai sem destinatário. Nenhuma tela extra aparece no meio do caminho.
- O documento digitado continua valendo quando o pagamento é na maquininha, que hoje emite a nota automaticamente.
- Só aparece em loja com nota fiscal ativa — as demais não veem nada de novo.
- As telas de pergunta que hoje interrompem o fluxo em algumas lojas deixam de ser necessárias e param de aparecer, já que o campo passa a ficar na própria tela de cobrança.

## Detalhes técnicos
- `src/components/pdv-v2/PDVV2PaymentDialog.tsx`: já existe o estado `customerDocument` e ele já é enviado em `onConfirm`. Adicionar no corpo do diálogo (perto de `PDVV2DocumentModeSelector`) um bloco colapsável "+ Informar CPF/CNPJ (opcional)" condicionado a `fiscalEnabled`, reaproveitando o mesmo `customerDocument`. Remover a abertura de `cpfChoiceOpen` no `handleConfirm` (linhas ~561-566), mantendo `finalizeConfirm` inalterado; o caminho TEF com `autoFinalizeAfterPrechargedTef` passa a carregar o documento já informado na tela.
- Nenhuma alteração em `finalizeConfirm`, `nfceService`, cobrança TEF, caixa ou impressão.
- `scripts/auto_printer.py` e `public/auto_printer.py`: no caminho RAW, aplicar ESC/POS (`ESC E` negrito, `GS B` invertido) nos blocos já marcados do layout V2 e logar aviso visível quando `win32ui` não estiver disponível ou `COMPANY_ID` estiver vazio.
- Subir versão e registrar em Novidades.

## Fora de escopo
- Não reimprimir pedidos antigos, não emitir/cancelar notas, não mexer em caixa, valores ou dados fiscais.
