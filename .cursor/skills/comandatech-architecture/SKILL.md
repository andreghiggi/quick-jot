---
name: comandatech-architecture
description: >-
  Descreve a arquitetura do ComandaTech — stack, pastas, rotas, módulos PDV/fiscal/
  pedidos e convenções React. Use ao implementar features, navegar o codebase,
  criar páginas/componentes ou quando o usuário mencionar PDV, NFC-e, pedidos,
  cardápio, financeiro ou revendedor.
---

# ComandaTech — Arquitetura

## Stack

React 18 · Vite 5 · TypeScript · Tailwind · shadcn/ui · Supabase · TanStack Query · Zustand · React Router · Zod + React Hook Form

## Estrutura de pastas

```
src/
  pages/          # Rotas (App.tsx)
  components/     # UI por domínio (pdv-v2/, frente-caixa/, financeiro/, admin/…)
  hooks/          # Data fetching e lógica reutilizável
  services/       # Integrações externas (NFC-e, pinpad, POS)
  utils/          # Funções puras
  integrations/supabase/  # client.ts + types (gerado)
supabase/
  migrations/     # SQL schema
  functions/      # Edge Functions Deno
```

## Rotas principais

| Área | Exemplos |
|------|----------|
| Público | `/auth`, `/cardapio/:slug`, `/mesa/:slug` |
| Operação | `/pedidos`, `/pdv`, `/pdv-v2`, `/frente-caixa` |
| Cadastros | `/produtos`, `/categorias`, `/combos` |
| Fiscal | `/fiscal`, `/nfce`, `/nfe/*` |
| Financeiro | `/financeiro/*`, `/relatorios/*` |
| Admin | `/admin/*` |
| Revendedor | `/revendedor/*` |

Rotas protegidas usam `<ProtectedRoute requireCompany>` ou `requiredRole`.

## Padrões ao editar código

1. **Escopo mínimo** — não refatorar além do pedido
2. **Convenções existentes** — copiar estilo de arquivos vizinhos
3. **Supabase** — `import { supabase } from "@/integrations/supabase/client"`
4. **UI** — componentes shadcn em `src/components/ui/`
5. **Não alterar stack** sem pedido explícito

## Módulos de negócio

- **PDV V1/V2** — vendas balcão, comandas, pagamentos
- **Frente de caixa** — NFC-e, TEF, caixa
- **Pedidos** — delivery, mesa, garçom
- **Fiscal** — NFC-e/NFe via Edge Functions (`nfce-proxy`, `nfe-proxy`)
- **Financeiro** — contas, fluxo de caixa
- **Revendedor** — licenças, billing Asaas

## Referência histórica

`VERSAO_ATUAL.md` — checkpoint de rotas e módulos (pode estar desatualizado; preferir `App.tsx`).
