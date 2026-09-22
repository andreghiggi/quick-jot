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

### Causa CONFIRMADA pelo registro que você mandou
O registro do PC mostra, em toda impressão de hoje, sempre as mesmas duas linhas:

- `win32ui indisponivel — usando modo RAW: DLL load failed while importing win32ui`
- `Modo GDI ignorado (win32ui/DLL) — impressao RAW direta`

Traduzindo: o programinha está na versão certa (1.7.8), com o código da loja certo, a impressora certa (POS-58) e a configuração certa (58mm, layout V2). **O único problema é o complemento do Windows que permite "pintar" o papel: ele está quebrado nesse computador.** Sem ele o programinha imprime só texto puro — exatamente o papel da sua foto.

O registro também mostra, à parte, quedas de internet/DNS na loja (o programinha às vezes não acha o servidor). Isso não tem relação com o layout, mas vale anotar.

### O conserto no PC do Rei do Açaí (5 minutos, no acesso remoto)
1. Clique em **Iniciar**, digite `cmd`, clique com o botão direito em **Prompt de Comando** e escolha **Executar como administrador**.
2. Cole este comando e dê Enter:
   `python -m pip install --upgrade --force-reinstall pywin32`
3. Cole este e dê Enter:
   `python -m pywin32_postinstall -install`
4. **Reinicie o computador.**
5. Abra o programinha (`iniciar_impressao`) e confira: não pode mais aparecer "Modo GDI ignorado".
6. Faça **um pedido de teste** na loja e compare com o modelo da foto.

Se o passo 2 ou 3 der erro, me mande a tela — nesse caso o conserto é reinstalar o pacote de impressão pelo instalador.

### Melhoria que vou aplicar no programinha (para nunca mais sair feio sem ninguém saber)
- Quando o jeito bonito não estiver disponível, ele passa a usar os recursos da própria impressora para manter pelo menos **negrito, título centralizado e texto invertido** (comandos que a POS-58 entende), em vez de sair tudo plano.
- E passa a mostrar um **aviso grande na tela ao abrir**, dizendo que está no modo simples e o que fazer.


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
