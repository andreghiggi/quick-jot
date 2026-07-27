---
name: PinPDV SmartPOS — Integração v1/v1.1/v2
description: Roadmap versionado da integração TEF SmartPOS PinPDV (Multiplus). v1 ativa piloto na Margen; v1.1 e v2 scaffoldadas e desligadas.
type: feature
---

# PinPDV SmartPOS — Módulo NOVO

Integração paralela ao TEF/PinPad atual (Multiplus PinPad serial). **Não altera nada do fluxo TEF/PinPad hoje em produção** — é uma trilha nova, gated pelo módulo `pinpdv_v1` / `pinpdv_v1_1` / `pinpdv_v2`.

## Cenários de loja com múltiplos caixas

O SmartPOS PinPDV é um Android autônomo que fala com a Multiplus por API/nuvem. O vínculo real é com o **serial do aparelho**, não com o PC/caixa.

- **Cenário A** — 1 SmartPOS físico, N caixas: risco de dois caixas dispararem no mesmo terminal. Solução: lock otimista `pinpdv_terminal_locks` por `terminal_id` com TTL 90s, liberado no webhook (aprovada/negada/cancelada) ou expiração.
- **Cenário B** — N SmartPOS, 1 por caixa: cadastro por caixa via `default_cash_register_id`. Nenhum lock global.
- **Cenário C** — Pool compartilhado (N SmartPOS, M caixas, qualquer combinação): mesmo lock do A, mas com seletor de terminal no diálogo de cobrança.

O modelo de dados cobre os 3 cenários com uma única tabela `pinpdv_terminals` (lista por empresa) + `pinpdv_terminal_locks` opcional.

## Regras de seleção de terminal no momento da cobrança

1. Se o **caixa aberto tem** `default_cash_register_id` apontando pra ele → usa esse (Cenário B, sem UI).
2. Se **só existe 1 terminal ativo** na empresa → usa esse (Cenário A com 1 caixa, sem UI, sem lock).
3. Se existem **múltiplos e o caixa atual não tem default** → seletor no diálogo com livres em verde e ocupados em cinza mostrando "Caixa X".

## Versões

### v1 (ATIVA — piloto Margen Pizzaria)
- Módulo: `pinpdv_v1`
- Escopo: **1 terminal por empresa, 1 caixa por vez**. Sem lock (não faz sentido para 1 caixa).
- Cadastro: `pinpdv_terminals` (uma linha por loja).
- UI: tab/card de cadastro em Integrações (visível apenas quando módulo ativo).
- Rollout: **APENAS Margen (`a0071b86-6f2a-43f5-80d9-26e3ecd4b70c`)**. Demais lojas continuam usando o TEF/PinPad atual intocado.

### v1.1 (SCAFFOLD — desligada)
- Módulo: `pinpdv_v1_1` (ainda não adicionado à lista de módulos até validar v1).
- Adiciona: cadastro de N terminais por empresa + `default_cash_register_id` (Cenário B automático) + trava `pinpdv_terminal_locks` para Cenário A/C.
- Tabela `pinpdv_terminal_locks` **já criada** pela migration da v1 mas **não usada em runtime** (nenhum código lê/escreve nela ainda).
- Ativação: aguardar 2ª loja pedir múltiplos caixas.

### v2 (SCAFFOLD — desligada)
- Módulo: `pinpdv_v2` (ainda não adicionado).
- Adiciona: dashboard de terminais online/offline via heartbeat da API Multiplus, alertas de aparelho fora do ar, histórico por terminal.
- Ativação: quando pelo menos 5 lojas usarem PinPDV.

## Salvaguardas (todas as versões)

- Zero mudança em `pinpadService.ts`, `tef-webservice`, `pdvV2Tef.ts`, `multiplusCardService.ts` legacy — o novo fluxo PinPDV v1 vive em arquivos próprios.
- Zero mudança em NFC-e, PDV V2, Frente de Caixa, Pedido Express, Cobrança de Comanda para lojas SEM o módulo ativo.
- Colunas e tabelas 100% aditivas. RLS por empresa via `user_belongs_to_company`. Gerenciamento só por `company_admin` / `super_admin`.

## Convivência com TEF Multiplus legado

A loja piloto (Margen) **não usa** o TEF Multiplus legado. Se um dia uma loja tiver ambos ativos, os fluxos permanecem independentes — configurações separadas, botões separados, logs separados.