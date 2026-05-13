---
name: Rachar Item da Comanda (I9)
description: Ícone de divisão por linha em "Itens selecionados" do PDV V2 fraciona um item da comanda entre N pessoas, preservando NCM real na NFC-e. Apenas Lancheria da I9.
type: feature
---

Disponível apenas para `company_id = 8c9e7a0e-dbb6-49b9-8344-c23155a71164` (Lancheria da I9).

## UX
No `PDVV2PaymentDialog.tsx`, modo `i9Mode === 'items'`, cada item não-pago com `quantity === 1` ganha um ícone `Split` (lucide-react). Clicar abre editor inline pedindo "em quantas pessoas" (2-10) e "quantas frações cobrar agora" (1..N). Aplicado, `selectedItemQtys.set(idx, fractions/people)` — `paidQty` vira fracionário (ex.: `0.5`).

## Banco
Migração `20260513_*` alterou `tab_items.quantity` e `pdv_sale_items.quantity` de `integer` para `numeric(10,3)`.

## Fluxo de pagamento
`confirmImportTabI9` em `src/pages/PDVV2.tsx` (lines 663+) já tratava `paidQty` em `saleItems` e em `partialPays`. Adicionado arredondamento `Math.round(x*1000)/1000` para quantidades e `Math.round(x*100)/100` para totais antes do insert.

## NFC-e
Item real vai com `quantity: 0.5, unit_price: 15.00` — NCM/CFOP/CSOSN do produto preservados. SEFAZ aceita até 4 casas em `qCom`. Sem mudança no `nfceService` ou edge `nfce-proxy`.

## TEF
Não afetado. TEF recebe apenas `valor`. Manter regras de TEF v1.0/v1.1/v1.2 beta congeladas.

## Limitações v1
- Split icon só aparece para itens com `quantity === 1`. Itens multi-qty mantêm controles +/− inteiros.
- Quando a fração restante (ex.: 0.5) é reaberta, cai no branch +/− e clamp permite cobrar a fração restante. UX suficiente para v1.
