---
name: NFC-e — override fiscal pelo cadastro do produto (Mercado)
description: Helper buildNfceFiscalFields + lookup CEST por NCM. Só ativo quando módulo `mercado` está habilitado; senão segue 100% pela regra tributária.
type: feature
---
- Helper: `src/utils/nfceItemFiscal.ts` → `buildNfceFiscalFields({ product, taxRule, mercadoEnabled, fallbackNcm?, fallbackCfop? })`.
- Regra: com `mercadoEnabled=true`, `ncm`/`cfop`/`cest` vêm do produto se preenchidos; senão da regra tributária; senão fallback ('00000000' / '5102'). Demais campos (CSOSN, alíquotas, CSTs) **sempre** da regra.
- `cest` é opcional no payload — só vai pro XML quando preenchido. `nfce-proxy` valida 7 dígitos.
- Lookup CEST: `src/utils/cestLookup.ts` + `src/data/cestNcm.json` (~178KB, lazy via dynamic import). 801 NCMs, baseado em Convênio ICMS 142/2018. Múltiplos CESTs → UI mostra Select; 1 só → auto-preenche.
- ProductEdit: onBlur do campo NCM dispara lookup (só se `mercadoEnabled` e `cest` vazio).
- 5 call sites usam o helper: `PDV.tsx` (2), `PDVV2.tsx` (2), `OrderCardChargeDialog.tsx` (2), `PedidoExpressDialog.tsx` (2). Lojas sem módulo mercado: comportamento idêntico ao anterior.
- `nfce-proxy` repassa `cest`/`CEST` na normalização de itens.
- Versão: 1.6.0.
