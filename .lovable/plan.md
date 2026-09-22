# Rei do Açaí: recibo sem formatação + volta do "CPF/CNPJ na nota"

## 1) Rei do Açaí — recibo saindo sem caixa, sem texto invertido e sem negrito

### O que foi verificado (somente leitura, produção)
- A loja está com **Layout V2** e **papel 58mm** cadastrados.
- O último trabalho enviado hoje (17:55, "Recibo D-392") foi gerado **já no layout completo**: contém a faixa de entrega/retirada, os rótulos de grupo dos complementos e os blocos de itens. Ou seja, o sistema está mandando o conteúdo certo.
- A versão publicada do sistema (1.73.2-beta) é a que contém essa geração.

### Conclusão do diagnóstico
O problema **não está no sistema**, está no programa de impressão instalado no computador da loja. O recibo rico só sai com caixa, texto invertido, negrito e linhas tracejadas quando o programa imprime em **modo gráfico**. Ele só entra nesse modo se as três condições valerem no PC:
1. o programa é a versão atual (1.7.8);
2. o **company_id** do Rei do Açaí está gravado na pasta (senão o programa não sabe que é uma loja em modo gráfico);
3. o complemento do Windows (pywin32/win32ui) está instalado e funcionando.

Faltando qualquer uma delas, o programa converte a página em **texto simples** e imprime exatamente como está saindo hoje: tudo plano, sem caixa e sem inversão.

### O que será feito
1. Ler o `printer_log.txt` do PC do Rei (no acesso remoto) para identificar qual das três condições falhou — o registro mostra a versão e a mensagem "Modo GDI ignorado".
2. Corrigir só o que faltar: atualizar o programa, gravar o company_id da loja e instalar o complemento do Windows.
3. Reimprimir **um recibo de teste** (não um pedido real) e comparar com o modelo anexado.
4. Melhoria de segurança no programa: quando o modo gráfico não estiver disponível, imprimir usando os recursos da própria impressora (negrito e texto invertido por comando), em vez de texto plano, e avisar em tela na abertura. Assim o recibo nunca mais degrada em silêncio.

## 2) Sumiu o botão "CPF/CNPJ na nota"

### Causa confirmada no código
Quando a loja tem nota fiscal ativa **e** tem forma de pagamento TEF (maquininha), o sistema passou a cobrar o cartão **antes** dos pop-ups. Depois que o cartão é aprovado, a cobrança é finalizada automaticamente e a nota é emitida — e nesse caminho a pergunta do CPF/CNPJ é pulada. Na Bon Appetit a forma TEF ainda vem pré-selecionada, então praticamente toda venda cai nesse caminho e o operador nunca vê o botão.

Fora do TEF, o pop-up também só aparece quando o operador escolhe "Venda + NFC-e"; o sistema memoriza a última escolha, e "Somente venda" é o padrão inicial.

### Lojas com token de nota configurado e situação de cada uma
| Loja | Nota ativa | TEF ativo | Pergunta o CPF hoje? |
|---|---|---|---|
| Lancheria Bon Appetit | sim | sim | não (pulado pelo TEF) |
| Lancheria da i9 | sim | sim | não (fluxo rápido próprio) |
| Cozinha da Ruiva | sim | sim | não (pulado pelo TEF) |
| Margen Pizzaria | sim | sim (Smart TEF) | não (pulado pelo TEF) |

As demais lojas não têm token de nota e, por isso, corretamente não exibem a opção.

### O que será feito
- Depois da aprovação do cartão, e antes de emitir a nota, exibir a tela curta de confirmação com **"+ Adicionar CPF/CNPJ (opcional)"** e o botão de emitir — em vez de finalizar direto.
- Vale para Bon Appetit, Cozinha da Ruiva e Margen Pizzaria. A Lancheria da i9 mantém o fluxo rápido de 1 clique que ela pediu (lá o CPF já está disponível na tela de confirmação da NFC-e).
- Sem mudar nada em cobrança, valores, TEF, caixa ou emissão em si: só volta a etapa de informar o documento.

## Detalhes técnicos
- `src/components/OrderCardChargeDialog.tsx` e `src/components/PedidoExpressDialog.tsx` passam `autoFinalizeAfterPrechargedTef`; em `PDVV2PaymentDialog.tsx` (linhas ~518-546) esse sinal finaliza antes de `setCpfChoiceOpen(true)`. Ajuste: manter o auto-finalizar apenas para a I9; nas demais lojas com `fiscalEnabled`, abrir `nfceConfirmOpen` (CPF opcional + imprimir) após o TEF aprovado.
- `useFiscalEnabled` já reconhece `fiscal_flow_api_token` e está publicado — não é a causa.
- `scripts/auto_printer.py` / `public/auto_printer.py`: modo gráfico depende de `COMPANY_ID in GDI_COMPANY_IDS` e `win32ui_ok`; incluir fallback com comandos ESC/POS (negrito `ESC E`, invertido `GS B`) e aviso em tela quando o modo gráfico estiver indisponível.
- Subir versão e registrar em Novidades.

## Fora de escopo
- Não reimprimir pedidos antigos, não emitir/cancelar notas, não mexer em caixa, valores ou dados fiscais.
