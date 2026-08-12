# Plano - Extensão Multi-Impressora (Branch Local Cursor)

Implementação do roteamento de comandas de produção para múltiplas impressoras físicas através de uma extensão do Chrome e um host nativo em Python.

## Passo 0: Preparação do Esquema (SQL Externo)
- Criar as tabelas `print_stations` e `category_print_stations`.
- Adicionar as colunas `station_id` e `job_type` na tabela `print_queue`.
- **Ação**: O usuário deve aplicar o SQL no Supabase externo.

## Passo 1: Núcleo Web (React)
- `src/hooks/usePrintStations.ts`: Hook para o CRUD de estações e carregamento de associações.
- `src/utils/printRouting.ts`: Utilitário central para agrupar itens de pedidos por estação e gerar múltiplos registros na fila de impressão (`print_queue`).
- `src/pages/Categories.tsx`: Adicionar seletor de estação por categoria.
- `src/pages/Settings.tsx`: Adicionar aba para gerenciamento das estações de impressão.

## Passo 2: Integração de Pedidos
- Modificar `Menu.tsx`, `Waiter.tsx` e `PDVV2` para utilizar o novo fluxo de divisão (split) de impressão ao confirmar um pedido.
- Garantir o funcionamento padrão (fallback) para a "Estação Padrão" caso nenhuma esteja configurada.

## Passo 3: Host Python e Extensão
- `scripts/auto_printer.py`: Atualizar para ler o `station_id` e consultar o mapa local de impressoras.
- `extension/`: Estruturar o manifesto V3 e o host de Mensageria Nativa para o mapeamento local no Windows.

## Detalhes Técnicos
- **Roteamento**: `produto -> categoria -> station_id -> nome_impressora_local`.
- **Trabalhos (Jobs)**: Pedidos com itens de categorias diferentes gerarão N entradas na `print_queue`.
- **Compatibilidade**: Se a tabela `print_stations` estiver vazia, o sistema mantém o comportamento atual de um único trabalho de impressão.

## Fases de Execução
1. Migrações e Hooks.
2. Interface de Configuração (Categorias/Configurações).
3. Lógica de Roteamento (divisão de trabalhos).
4. Script Python e Extensão local.
