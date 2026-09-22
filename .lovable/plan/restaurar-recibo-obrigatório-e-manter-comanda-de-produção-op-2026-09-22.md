# Restaurar recibo obrigatório e manter comanda de produção opcional

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

### Regra correta do produto
- O **recibo do pedido é obrigatório para todas as lojas** e deve ser criado independentemente de qualquer opção.
- A opção **Comanda de produção** controla somente o papel da cozinha: ligada cria a comanda; desligada não cria.
- O código atual viola essa regra ao condicionar recibos à opção da comanda e ao limitar o recibo automático a lojas específicas.

## Solução

### Etapa 1 — separar recibo de comanda de produção
- Restaurar a regra única do sistema: todo pedido cria seu recibo; a opção “Comanda de produção” decide apenas se haverá também o papel da cozinha.
- Remover as listas especiais que hoje restringem o recibo automático a Amore Mio e Rei do Açaí.
- Aplicar a regra em todos os pontos que criam pedidos: cardápio, Pedido Express, balcão/PDV e demais origens que usam a fila automática, sem duplicar recibos em fluxos que já os criam.
- Fazer a liberação de impressão primeiro no **Rei do Açaí** e na **Bon Appetit**; somente após os dois resultados físicos corretos, liberar a mesma correção às demais lojas.

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

### Etapa 4 — impedir novas regressões em todas as lojas
- Centralizar a decisão em duas saídas independentes: `recibo obrigatório` e `comanda conforme opção`.
- Garantir que salvar/desligar a opção de comanda atualize a leitura usada no pedido seguinte, sem estado antigo divergente entre tela e servidor.
- Adicionar verificações automáticas para as duas combinações válidas:
  - opção desligada → 1 recibo e 0 comandas;
  - opção ligada → 1 recibo e 1 ou mais comandas, conforme as estações da loja.
- Verificar todas as origens de pedido para assegurar que nenhuma pula o recibo e nenhuma o duplica.

### Etapa 5 — validação controlada
- Antes da publicação, gerar amostras com os mesmos tipos de dados das fotos e comparar bloco por bloco, em 58 mm para o Rei e 80 mm para a Bon Appetit.
- Publicar com isolamento pelos identificadores das duas lojas.
- Validar com um pedido real autorizado em cada loja:
  - **Rei:** exatamente 1 papel, o recibo completo; nenhuma comanda de produção.
  - **Bon Appetit:** exatamente 2 papéis, uma comanda de produção e um recibo completo.
- Conferir no registro da fila os tipos `receipt` e `production`, sem reimprimir pedidos antigos.
- Depois dos dois pilotos físicos aprovados, liberar a regra obrigatória às demais lojas e conferir uma amostra de cada layout V1/V2/V3.
- Registrar a correção em **Novidades** e atualizar o pacote de impressão somente se a comparação confirmar que o programa instalado não preserva alguma faixa ou símbolo.

## Limites de segurança
- Nenhum pedido, venda, caixa ou histórico será alterado ou apagado.
- Nenhuma NFC-e será emitida, cancelada, reemitida ou inutilizada.
- TEF/PinPad não será alterado.
- As demais lojas não receberão mudança de impressão antes da validação física dos dois pilotos.
- Não haverá reimpressão automática de pedidos antigos nem processamento de backlog.

## Detalhes técnicos
- Ajustar os criadores de pedido para sempre enfileirar um recibo e consultar a opção somente antes de enfileirar a comanda.
- Reutilizar `buildReceiptHtmlV2Rich`/`printOnlyReceipt`; não criar um terceiro modelo divergente.
- Manter `auto_printer.py` em GDI para o Rei e RAW atual para a Bon Appetit, salvo evidência física contrária no teste.
- Garantir idempotência por pedido e tipo de papel para não gerar recibo duplicado em duplo clique, repetição da chamada ou fluxo que já imprime após pagamento.
- Atualizar a configuração do Rei somente na VPS de produção, que é a base ativa; nenhuma sincronização com a nuvem Lovable será feita.
