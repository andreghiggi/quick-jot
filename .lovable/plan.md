# Amore Mio — restaurar a comanda de produção V2 no printer 1.7.0

Escopo estrito: somente a impressão local da **Amore Mio** (`f5f9eec3-67bc-497a-88a6-ce41d3b15df8`). Nenhuma outra loja, fluxo de pedido, TEF, NFC-e ou configuração será alterada.

## Diagnóstico confirmado

- O sistema já envia a comanda da Amore Mio como **Layout V2**, com `HTML_START/HTML_END`, código curto do pedido e os dados corretos.
- O `auto_printer.py` 1.7.0 desvia exclusivamente a Amore Mio para o renderizador GDI.
- Esse renderizador extrai o texto do HTML e redesenha todas as linhas quase com o mesmo tamanho. Assim, ele descarta a hierarquia visual do V2: título grande, modalidade destacada, pedido, faixa preta do cliente, data/previsão grandes e diferença entre quantidade e nome do produto.
- A fonte atual é calculada em cerca de 16 pixels a 203 DPI, explicando a impressão muito pequena mostrada na foto.
- Portanto, baixar novamente a versão 1.7.0 não corrige: o defeito está na própria renderização dessa versão, não na configuração da impressora.

## Correção em 3 etapas

1. **Reproduzir fielmente o V2 no GDI da Amore Mio**
   - Manter o modo gráfico, necessário para a POS 58 mm e para evitar PDF com 0 bytes.
   - Criar estilos GDI próprios por elemento: título, modalidade, número do pedido, cliente invertido, data, “Pronto até”, quantidade, produto e rodapé.
   - Usar proporções, pesos, alinhamentos, margens e faixas pretas equivalentes ao PDF `TESTE_COMNDA_V39.pdf`, em vez da fonte única atual.

2. **Preservar conteúdo e roteamento existentes**
   - Continuar consumindo o mesmo HTML V2 já gerado pelo sistema.
   - Preservar código curto (ex.: `B-036`), modalidade, cliente, horário, previsão, itens, adicionais, observações e final da comanda.
   - Manter o roteamento para duas impressoras e o fallback atual, sem alterar Bon Appetit, Império do Açaí, Rei do Açaí ou qualquer outra empresa.

3. **Validar e liberar uma nova versão do printer**
   - Testar o renderizador com o conteúdo do PDF de referência em saída 58 mm e Microsoft Print to PDF.
   - Confirmar uma única impressão por job, conteúdo não vazio e aparência compatível com o V2 de referência.
   - Incrementar a versão do `auto_printer.py`, registrar em Novidades e disponibilizar o novo download. Após a correção, será necessário substituir o 1.7.0 na máquina da Amore Mio e reiniciar o inicializador de impressão.

## Critérios de aceite

- Cabeçalho e informações principais ocupam a largura útil do papel, sem o aspecto minúsculo da foto atual.
- `CLIENTE LOJA` aparece em faixa preta; título, modalidade, pedido, data e previsão seguem a hierarquia do PDF.
- Item mostra quantidade em destaque e nome com peso normal, como na referência.
- POS 58 mm imprime conteúdo; Microsoft Print to PDF gera arquivo válido e não vazio.
- Cada job gera apenas uma impressão.
- Nenhuma outra loja é afetada.
