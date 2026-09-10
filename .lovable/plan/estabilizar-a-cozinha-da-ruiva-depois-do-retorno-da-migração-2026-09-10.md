# Estabilizar a Cozinha da Ruiva depois do retorno da migração

## O que eu já confirmei olhando os dados de hoje

- **Cartão/TEF está funcionando.** Hoje houve 3 cobranças aprovadas na maquininha (07:55, 08:21 e 10:21). Duas viraram venda com nota autorizada; **a de R$ 103,00 das 10:21 foi aprovada na maquininha mas não virou venda** — é exatamente o caso do "erro ao registrar venda".
- **Nota fiscal está normal.** A última nota autorizada saiu hoje às 08:24, na sequência correta.
- **43 vendas dos dias 08 e 09/09 estão "soltas".** Elas foram recuperadas do servidor antigo, mas apontam para dois caixas que não existem aqui. Resultado: essas vendas **não aparecem no fechamento de caixa** nem nos totais por forma de pagamento. O mesmo acontece na Lancheria Bon Appetit (27 vendas) e na Margen Pizzaria (7).
- **A numeração de venda está atrasada.** Na Cozinha da Ruiva o próximo número seria 1585, mas já existe venda até 1629 — ou seja, as próximas vendas vão repetir números já usados. Também está atrasada na Bon Appetit, Espaço Lanches, Império do Açaí, Margen Pizzaria e Lancheria da i9.
- **O que ainda não sei:** o motivo exato da falha ao registrar a venda. Hoje a tela mostra só "Erro ao registrar venda", sem o motivo, e isso não fica gravado em lugar nenhum. Sem esse detalhe qualquer correção seria chute.

## O que vou fazer

### 1. Mostrar o motivo real do erro (primeiro passo, imediato)
Trocar a mensagem genérica por uma que mostre o motivo da recusa e gravar esse motivo no histórico, em todas as telas de venda (caixa, Pedido Express e cobrança de comanda). Assim, na próxima falha a loja me diz o motivo em vez de "deu erro".

### 2. Consertar a numeração das vendas
Ajustar o contador de cada loja afetada para continuar a partir do último número já usado, evitando venda com número repetido. Nenhuma venda existente é alterada.

### 3. Devolver as vendas recuperadas ao fechamento
Recriar os turnos de caixa dos dias 08 e 09/09 que ficaram faltando (como caixas já fechados, com os mesmos horários das vendas) para que as 77 vendas voltem a aparecer no fechamento e nos relatórios. Valores, notas e formas de pagamento das vendas não são tocados.

### 4. Resolver a cobrança de R$ 103,00 sem venda
Vou levantar os dados dessa cobrança e apresentar para você decidir: registrar a venda com o comprovante da maquininha, ou estornar. **Não faço nada nessa cobrança sem sua confirmação.**

### 5. Evitar que o erro atrapalhe a venda de novo
- Se o registro da venda falhar, tentar novamente automaticamente antes de mostrar erro (falhas rápidas de conexão deixam de virar erro na tela).
- Quando o cartão já foi aprovado e o registro falha, a tela passa a avisar claramente que **o cliente já foi cobrado** e oferece o botão "Tentar registrar de novo", em vez de deixar o operador no escuro.
- Guardar a venda pendente no próprio caixa: se o operador fechar a tela sem querer, ela reaparece para ser concluída.
- Conferência automática diária de vendas sem caixa e de numeração atrasada, para eu detectar antes da loja perceber.

### 6. Conferência final
Depois de aplicar: conferir fechamento do dia, totais por forma de pagamento, pedidos do dia e histórico do TEF da Cozinha da Ruiva, e repetir a conferência de vendas soltas nas demais lojas.

## Limites

- Nada de emitir, reemitir ou inutilizar nota fiscal.
- Nenhuma venda, pedido ou nota apagada.
- Nenhuma mudança no TEF, nos layouts de impressão ou nos Auto Printers de cada loja.
- Nenhuma mudança nas outras lojas além do acerto de numeração e dos caixas faltantes já listados.

## Detalhes técnicos

- `pdv_sale_number_counters.next_value` → `max(pdv_sales.pv_numero)+1` por `company_id` (dado, não schema).
- Caixas ausentes: `850036a2-...` e `c2d3ea16-...` (Ruiva) e equivalentes em Bon Appetit/Margen — recriar em `cash_registers` com o mesmo `id`, `status='closed'`, `opened_at/closed_at` derivados de `min/max(created_at)` das vendas vinculadas.
- Front: `src/hooks/useCashRegister.ts` (`addSale`), além dos pontos de cobrança em `PDVV2SequentialPaymentDialog` / Pedido Express / `OrderCardChargeDialog`, passando `error.message`/`details` ao toast e ao `console.error`.
- Sem migration de schema; alterações de dados via SQL de dados.
