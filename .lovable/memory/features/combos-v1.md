---
name: Combos v1 (piloto Rei do Açaí)
description: Cadastros > Combos com modo fiscal "kit explodido", gate combos_v1, piloto Rei do Açaí
type: feature
---

# Combos v1.6 (versão app 1.23.0-beta)

## Onde fica
- Aba **Cadastros > Combos** na sidebar (`/combos`), gated por `isModuleEnabled('combos_v1')`.
- Toggle no Super Admin > Módulos da empresa: `combos_v1` ("Combos (Beta)").
- Piloto: ativo só para a loja **Rei do Açaí**. Demais lojas não veem o item de menu.

## Tabelas
- `combos` (company_id, name, code, gtin, description, image_url, price, active, display_order, pdv_item, menu_item, waiter_item, fiscal_mode default `explodido`, ncm, cfop, cest, tax_rule_id).
- `combo_items` (combo_id, product_id, quantity, display_order).
- `combo_categories` (combo_id, category_id).
- RLS via `user_belongs_to_company(auth.uid(), company_id)`. `anon` pode ler combos ativos (cardápio público).

## Hook / página
- `src/hooks/useCombos.ts` — fetch, save (upsert combo + reset N:N), delete, toggleActive.
- `src/pages/Combos.tsx` — lista + dialog editor (3 abas: Geral, Itens, Fiscal).

## Regra fiscal (NFC-e)
- Padrão **explodido**: na NFC-e cada `combo_item` deve virar um `<det>` com NCM/CFOP/CEST/CST/alíquotas do **produto componente** (via `buildNfceFiscalFields`), e o preço do combo (vDesc/vUnTrib) é rateado proporcionalmente entre os componentes (centavos arredondados, última linha absorve diferença).
- A expansão fiscal **ainda não está implementada** no `nfce-proxy` — entra na próxima fase quando o piloto começar a vender. Por enquanto, o combo grava no carrinho como 1 linha visível, mas a NFC-e só vai bater quando o proxy for atualizado.
- Modo `kit_comercial` (combo como 1 item fiscal) está previsto na tabela mas não é a recomendação — usar só se cliente exigir.

## O que NÃO foi tocado
- TEF/PinPad/Multiplus (frozen).
- Print V3 da I9 (frozen).
- Multi-pagamento v1.6/v1.7.
- PDV V2, Pedido Express, OrderCardChargeDialog, Frente de Caixa.
- Estrutura atual de produtos, categorias, adicionais.
- `src/integrations/supabase/client.ts` e `types.ts` (auto-gen).

## Próximos passos (não feitos ainda)
1. Expandir combo em N `<det>` no edge function `nfce-proxy` (kit explodido com rateio).
2. Mostrar combo no cardápio público / PDV V2 / Pedido Express como produto normal (já lê por `pdv_item/menu_item/waiter_item`, falta integração nos hooks `useProducts`-like ou união explícita).
3. Imprimir título do combo + componentes indentados na comanda de produção (mesmo padrão dos opcionais agrupados v3).