# Plan - Extensão Multi-Impressora (Local Cursor Branch)

Implementação do roteamento de comandas por categoria para múltiplas impressoras físicas via extensão Chrome e host nativo.

## Passo 0: Preparação do Schema (SQL Externo)
- Criar tabelas `print_stations` e `category_print_stations`.
- Adicionar colunas `station_id` e `job_type` em `print_queue`.
- **Ação**: O usuário deve aplicar o SQL no Supabase externo.

## Passo 1: Core Web (React)
- `src/hooks/usePrintStations.ts`: Hook para CRUD de estações e carregamento de vínculos.
- `src/utils/printRouting.ts`: Utilitário central para agrupar itens de pedido por estação e gerar múltiplos registros na `print_queue`.
- `src/pages/Categories.tsx`: Adicionar seletor de estação por categoria.
- `src/pages/Settings.tsx`: Adicionar aba de gerenciamento de estações.

## Passo 2: Integração de Pedidos
- Modificar `Menu.tsx`, `Waiter.tsx` e `PDVV2` para utilizar o novo fluxo de split de impressão ao confirmar um pedido.
- Garantir fallback para "Estação Padrão" se nenhuma estiver configurada.

## Passo 3: Host Python & Extensão
- `scripts/auto_printer.py`: Atualizar para ler `station_id` e consultar mapa local.
- `extension/`: Estruturar manifest V3 e Native Messaging host para mapeamento local.

## Technical Details
- **Roteamento**: `product -> category -> station_id -> local_printer_name`.
- **Jobs**: Pedidos com itens de categorias diferentes gerarão N entradas na `print_queue`.
- **Compatibilidade**: Se a tabela `print_stations` estiver vazia, o sistema mantém o comportamento atual de job único.

## Fases de Execução
1. Migrations & Hooks.
2. UI de Configuração (Categories/Settings).
3. Lógica de Roteamento (split jobs).
4. Script Python & Extensão local.
