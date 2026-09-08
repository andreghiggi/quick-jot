# Correção dos cardápios públicos (sem tocar em dados)

Objetivo: cardápio abrir tanto em `app.comandatech.com.br/cardapio/:slug` quanto em `{loja}.comandatech.com.br`, sem redirecionamento forçado e sem ficar preso em "Carregando". Nenhuma alteração de banco, dados, imagens ou visual.

## 1. Redirecionamento (causa principal)

Em `src/pages/Menu.tsx`, depois de encontrar a loja, o código chama `window.location.replace` para o subdomínio sempre que a loja tem subdomínio e o host termina em `.com.br` — isso inclui `app.comandatech.com.br`, então a página recarrega inteira ao abrir `/cardapio/:slug`.

Mudança: redirecionar **apenas** quando o host for o domínio antigo (`appcomandatech.agilizeerp.com.br` ou qualquer `*.agilizeerp.com.br`). Em `app.comandatech.com.br/cardapio/:slug` o cardápio renderiza na própria rota; em `{loja}.comandatech.com.br` o fluxo atual por `detectDomainContext()` continua igual.

## 2. Primeira pintura mais rápida

`loading` do Menu passa a considerar apenas empresa, produtos e categorias. Bairros de entrega, horários, configurações e grupos de opcionais deixam de bloquear a primeira renderização (continuam carregando em segundo plano e aparecem quando prontos).

## 3. Estado de carregamento dos hooks

`useProducts` e `useCategories`: quando o identificador da loja passa de vazio para definido, marcar carregando antes da busca. Hoje eles podem ficar com `loading` já falso e a tela mostrar lista vazia por um instante.

## 4. Opcionais por loja

`useOptionalGroups` busca `optional_group_categories` e `optional_group_products` sem filtro (tabela inteira). Passa a filtrar por `.in('group_id', groupIds)` dos grupos da loja — mais rápido e sem depender de leitura global (que pode vir vazia por permissão e fazer os opcionais sumirem).

## 5. Limpeza de sessão antiga

Em `index.html`, remover na carga as chaves de `localStorage` que apontem para o projeto antigo (`iwmrtxdzlkasuzutxvhh` / `sb-iwmrtx*`), evitando sessão inválida travando as requisições.

## Observação técnica

O cliente do backend em `src/integrations/supabase/client.ts` já usa somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` — nenhum endereço fixo no código. O arquivo `.env` do editor Lovable ainda aponta para a nuvem antiga (é gerado automaticamente e não pode ser editado aqui); na VPS o valor correto vem do build do servidor.

## Fora de escopo

Nada de alteração visual, de pagamento, pedido, fiscal, scripts de dados ou novos pontos de entrada.

## Pronto quando

- `/cardapio/rei-do-acai` abre no domínio app, sem troca de host.
- `reidoacai.comandatech.com.br` abre o mesmo cardápio.
- Produtos, categorias e opcionais aparecem.
- Front publicado.
