# Plano de Implementação: Módulo Balança e Venda por Peso no PDV V2

Este plano descreve a implementação do suporte a balanças (inicialmente **Wind D3**) e a otimização do fluxo de venda por peso no **PDV V2**, permitindo uma operação ágil sem a burocracia do fluxo de pedidos tradicional.

## 1. Módulo de Configuração (Aba Balança)
- Criar a aba **Balança** em `Settings.tsx`.
- Configurações: Habilitar Balança, Modelo (**Wind D3**), Porta Serial e Baud Rate.
- Fornecer os scripts atualizados (`auto_printer.py`) e instaladores.

## 2. Ajuste no Script Local (Python - auto_printer.py)
- Integrar servidor local (ex: porta 8081) para expor o peso da balança via HTTP.
- Implementar protocolo da Wind D3 via `pyserial`.
- Atualizar o `.bat` de instalação para incluir dependências de balança.

## 3. Fluxo Ágil de Venda por Peso no PDV V2
- **Identificação de Itens por Peso**: No cadastro de produtos, identificar itens que usam balança (unidade 'kg').
- **Atalho no PDV V2**:
  - No componente de busca/seleção de itens do PDV V2 (`PDVV2AddItemSearch` ou `PDVV2CategoryBrowser`), ao selecionar um item de balança:
  - Disparar automaticamente (ou via botão de destaque) a leitura do peso.
  - Se o peso for > 0, adicionar o item ao rascunho de venda instantaneamente com o cálculo `Peso x Preço`.
  - Evitar a abertura do wizard de opcionais se não houver seleções obrigatórias, priorizando a velocidade.

## 4. Integração com a Comanda/Mesa
- Permitir que o peso lido seja lançado diretamente em uma comanda aberta com apenas um clique/atalho, mantendo o operador na tela de lançamento.

## Detalhes Técnicos
- `scripts/auto_printer.py`: Adicionar classe `ScaleService`.
- `src/components/pdv-v2/PDVV2AddItemSearch.tsx`: Injetar lógica de "Auto-Balancê" (leitura automática ao selecionar item kg).
- `src/hooks/useScale.ts`: Novo hook para abstrair a comunicação com o `localhost:8081`.
