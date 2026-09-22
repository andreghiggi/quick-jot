# Corrigir recibos do Rei do Açaí e da Bon Appetit sem afetar outras lojas

## Diagnóstico confirmado

### 1. Rei do Açaí
- A foto atual é uma **comanda de produção em formato simples**: “Comanda #10”, itens sem valores/totais e sem as faixas invertidas completas.
- O modelo desejado da outra foto é o **recibo V2/V39 completo**: nome da loja, número destacado, origem do pedido, data, “Pronto até”, cliente invertido, telefone, pagamento, modalidade, grupos com `■`, adicionais com `+`, subtotal, total e rodapé.
- Na produção, o Rei está configurado com **layout V2**, papel **58 mm** e `auto_print_production_ticket=true`. Portanto, a opção está gravada como ligada no servidor, mesmo que a tela tenha sido vista desligada.
- O código do cardápio só cria o recibo do Rei **dentro da mesma condição da comanda de produção**. Se a opção for desligada corretamente, hoje ele deixa de criar também o recibo. Essa ligação indevida é a causa do comportamento.
- O último papel registrado para o Rei foi `Recibo D-392`, mostrando que o modelo de recibo já existe; o que falta é tornar o recibo independente da comanda e impedir o caminho simples.

### 2. Bon Appetit
- Na produção, a Bon Appetit está com **layout V2**, papel **80 mm** e comanda de produção ligada.
- O código do cardápio cria recibo automático somente para Amore Mio e Rei do Açaí. A Bon Appetit não está nessa regra; por isso ela cria somente a comanda de produção.
- O programa local está consumindo a fila, pois a comanda sai no papel. A ausência do recibo ocorre antes do computador da loja: o segundo papel não é criado pelo sistema.

## Solução

### Etapa 1 — separar recibo de comanda de produção
- Criar uma regra única de impressão por loja, sem usar a opção “Comanda de produção” para decidir se o recibo deve existir.
- Aplicar inicialmente somente:
  - **Rei do Açaí:** recibo automático ligado; comanda de produção desligada.
  - **Bon Appetit:** recibo automático ligado; comanda de produção ligada.
- Preservar o comportamento atual das demais lojas.

### Etapa 2 — Rei do Açaí no modelo completo
- Fazer cardápio e Pedido Express enviarem somente o recibo V2/V39 completo do Rei.
- Usar o nome **REI DO AÇAÍ**, o número real do pedido e os dados reais do pedido; não copiar “Lancheria da I9”.
- Preservar no papel de 58 mm:
  - origem com ícone/símbolo compatível com a impressora;
  - cliente e endereço em faixa preta com texto branco;
  - modalidade destacada;
  - grupos com quadrado `■` e sublinhado;
  - adicionais com `+`, valores, subtotal e total;
  - “Pronto até” e rodapé.
- Bloquear especificamente para o Rei qualquer criação automática de `job_type=production`, inclusive quando a configuração antiga ainda estiver gravada como ligada.
- Corrigir a configuração do Rei na produção para refletir a tela: comanda de produção desligada. Nenhum pedido ou fila existente será apagado.

### Etapa 3 — Bon Appetit com os dois papéis
- Manter a comanda de produção atual sem mudar seu conteúdo.
- Criar também um recibo V2 completo para cada novo pedido do cardápio e do Pedido Express.
- Direcionar o recibo para a mesma impressora padrão usada hoje, pois a loja não possui estação cadastrada.
- Se a criação do recibo falhar, registrar e mostrar a falha; não considerar o segundo papel como concluído silenciosamente.

### Etapa 4 — validação controlada
- Antes da publicação, gerar amostras com os mesmos tipos de dados das fotos e comparar bloco por bloco, em 58 mm para o Rei e 80 mm para a Bon Appetit.
- Publicar com isolamento pelos identificadores das duas lojas.
- Validar com um pedido real autorizado em cada loja:
  - **Rei:** exatamente 1 papel, o recibo completo; nenhuma comanda de produção.
  - **Bon Appetit:** exatamente 2 papéis, uma comanda de produção e um recibo completo.
- Conferir no registro da fila os tipos `receipt` e `production`, sem reimprimir pedidos antigos.
- Registrar a correção em **Novidades** e atualizar o pacote de impressão somente se a comparação confirmar que o programa instalado não preserva alguma faixa ou símbolo.

## Limites de segurança
- Nenhum pedido, venda, caixa ou histórico será alterado ou apagado.
- Nenhuma NFC-e será emitida, cancelada, reemitida ou inutilizada.
- TEF/PinPad não será alterado.
- Nenhuma configuração ou impressão das demais lojas será modificada.
- Não haverá reimpressão automática de pedidos antigos nem processamento de backlog.

## Detalhes técnicos
- Ajustar `Menu.tsx` e `PedidoExpressDialog.tsx` para políticas independentes de recibo e produção por `company_id`.
- Reutilizar `buildReceiptHtmlV2Rich`/`printOnlyReceipt`; não criar um terceiro modelo divergente.
- Manter `auto_printer.py` em GDI para o Rei e RAW atual para a Bon Appetit, salvo evidência física contrária no teste.
- Garantir idempotência por pedido e tipo de papel para não gerar recibo duplicado em duplo clique ou repetição da chamada.
- Atualizar a configuração do Rei somente na VPS de produção, que é a base ativa; nenhuma sincronização com a nuvem Lovable será feita.
