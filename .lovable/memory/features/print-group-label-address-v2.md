---
name: Print V2 — rótulo de grupo + endereço invertido
description: Comanda/recibo V2 com ■ sublinhado, endereço invertido, + adicionais, pronto até e compacto para todas as lojas V2.
type: feature
---

## Markers V2 (auto_printer.py v8.32+)
- `[ADDGROUP_LABEL]Nome[/ADDGROUP_LABEL]` → `■ Nome` em **sublinhado**, capitalização original (sem CAPS).
- `[ENDERECO]endereço[/ENDERECO]` → bloco invertido (fundo preto, texto branco), mesmo estilo de `[CLIENTE]`.
- `[ADD]item[/ADD]` (já existia) → `+ ITEM` em CAPS para lojas com layout V2.

## Regras de renderização (todas as lojas com layout V2 ativo)
- **1 grupo só** → não emite `[ADDGROUP_LABEL]`, lista direto `+ ITEM`.
- **2+ grupos** → emite `[ADDGROUP_LABEL]Nome[/ADDGROUP_LABEL]` antes de cada bloco de itens.
- Endereço é emitido quando `deliveryAddress` presente e layout V2.
- `auto_printer.py` v8.38 também aplica `Pronto até` no recibo V2, remove linhas vazias artificiais no GDI e usa modo compacto para lojas V2.

## Arquivos
- `src/pages/Menu.tsx` e `src/components/PedidoExpressDialog.tsx` → cardápio público e Pedido Express propagam `groupedOptionals` para todas as lojas com Layout V2/V3 ativo.
- `src/utils/printProductionTicket.ts` → V2 emite os markers no HTML.
- `src/utils/pdvV2Print.ts` → `buildReceiptHTML` (V2) emite os markers + propaga `deliveryAddress` e `groupedOptionals`.
- `scripts/auto_printer.py` → handlers `m_addgroup` e `m_endereco` no laço principal.

## Próximo passo
Validar Margen com pedido real após baixar/rodar `auto_printer.py` v8.38+; se algum caminho interno do PDV V2 ainda sair plano, propagar `groupedOptionals` também nesse caller específico.