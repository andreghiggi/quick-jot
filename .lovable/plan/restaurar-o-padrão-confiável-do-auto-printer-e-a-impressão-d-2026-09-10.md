# Restaurar o padrão confiável do Auto Printer e a impressão do Garçom

## Diagnóstico confirmado

- O Auto Printer antigo enviado pelo usuário já monitora os dois caminhos usados pelo sistema: pedidos normais e `print_queue` (Garçom/PDV).
- Na Bon Appetit, pedidos normais recentes foram consumidos pelo Auto Printer, portanto conexão, identificação da loja e impressora local estão funcionando.
- A Bon Appetit está configurada com impressão automática ativa, papel 80 mm e layout V2.
- A loja não possui estações nem vínculos de impressora cadastrados; nesse caso, a impressão deve usar a impressora padrão do Windows.
- Itens foram adicionados recentemente pelo usuário Garçom nas comandas 591 e 592, mas nenhum novo registro `Comanda #...` foi criado na fila. Portanto, a falha atual ocorre antes do Auto Printer: o envio do Garçom não está chegando à fila.
- O histórico mostra que comandas do Garçom já funcionaram nesse mesmo formato (`station_id` vazio e `job_type=production`). Não é necessário alterar banco, impressoras ou layouts.

## Correção

1. **Manter o Auto Printer no padrão que já funcionou**
   - Preservar o monitoramento de pedidos normais e da fila do Garçom/PDV a cada 5 segundos.
   - Manter isolamento obrigatório por `company_id`.
   - Manter impressora padrão quando a loja não usa estações e respeitar mapeamento quando usa.
   - Confirmar como impresso somente depois do envio bem-sucedido.

2. **Corrigir o envio do Garçom para a fila**
   - Criar diretamente um job geral quando a loja não possui estações, sem depender de consultas ou campos opcionais.
   - Quando houver estações, manter o roteamento por categoria já configurado.
   - Usar somente os campos existentes na fila: empresa, conteúdo, rótulo, estação, tipo e status.
   - Fazer a tela considerar sucesso apenas quando o registro realmente for criado; em falha, exibir o erro real.

3. **Preservar os layouts de cada loja**
   - Não alterar geração visual V1, V2 ou V3, tamanho de papel, GDI/RAW, recibos, cabeçalhos ou regras exclusivas por empresa.
   - O Auto Printer continuará carregando `print_layout` e `printer_paper_size` da própria loja.
   - Não alterar TEF, fiscal, NFC-e, pedidos existentes ou histórico da fila.

4. **Garantir o download correto por loja**
   - Conferir que o arquivo baixado pelo painel leve o `company_id`, nome, papel e layout da loja logada.
   - Manter o iniciador com a mesma identificação da loja e sem substituir configurações de outras empresas.

5. **Registrar e validar**
   - Atualizar a versão e registrar a correção em Novidades.
   - Validar tipos/build e o script Python.
   - Testar na Bon Appetit: adicionar item pelo Garçom, confirmar criação de `Comanda #...` pendente, consumo pelo Auto Printer e confirmação após imprimir.
   - Conferir também os dois cenários gerais: loja sem estações usa impressora padrão; loja com estações mantém seu roteamento, versão e layout.

## Limites de segurança

- Nenhuma alteração de estrutura ou limpeza no banco.
- Nenhum pedido será apagado ou recriado.
- Nenhuma nota fiscal será emitida, reemitida ou inutilizada.
- Nenhuma mudança em TEF/PinPad.
- Nenhuma padronização visual entre lojas; somente o mecanismo de busca e consumo será comum.
