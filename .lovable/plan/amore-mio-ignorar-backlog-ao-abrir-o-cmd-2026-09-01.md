# Amore Mio: ignorar backlog ao abrir o cmd

## Problema
Ao abrir o `iniciar_impressao.cmd`, o script encontra tudo o que estava pendente (pedidos com `printed = false` e itens da `print_queue`) e começa a processar/imprimir esse acúmulo antigo. A loja quer que, ao iniciar, o script "zere" e passe a imprimir apenas o que chegar dali em diante.

## Comportamento novo (exclusivo Amore Mio)
Na inicialização, antes de entrar no loop de monitoramento:

1. O script busca as pendências existentes (pedidos não impressos e itens da fila).
2. Marca todas como já processadas (`printed = true`, `printed_at = agora`) — sem imprimir nada.
3. Mostra no console: "Backlog descartado: X pedido(s) e Y item(ns) de fila. Imprimindo apenas novos a partir de agora."
4. Só então inicia o monitoramento normal.

Nenhuma outra loja é afetada: o descarte roda apenas quando o `company_id` for o da Amore Mio, usando a mesma lista de isolamento já existente no script.

## Detalhes técnicos
- `scripts/auto_printer.py` (nova versão 1.7.4):
  - Nova constante `SKIP_BACKLOG_COMPANY_IDS = {"f5f9eec3-67bc-497a-88a6-ce41d3b15df8"}`.
  - Nova função `descartar_backlog(company_id)`: `GET` em `orders?printed=eq.false` e `print_queue?printed=eq.false`, seguido de `PATCH` marcando cada registro como impresso (mesmo padrão de PATCH já usado após imprimir).
  - Chamada em `main()` logo após `carregar_config_loja(force=True)` e antes do `while True`, somente se o `company_id` estiver na allow-list.
- `scripts/iniciar_impressao.cmd`: sem mudança de lógica; apenas nota na tela informando que o backlog é descartado ao iniciar (opcional).
- Nenhuma alteração de banco, RLS ou frontend. A loja precisa baixar o script atualizado (v1.7.4) pelo painel.
- Bump de versão do sistema e registro em Novidades.
