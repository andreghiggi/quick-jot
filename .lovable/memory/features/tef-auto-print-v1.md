---
name: TEF Auto Print v1
description: Impressão automática do comprovante TEF (1ª via) após aprovação PinPad — isolada do código TEF congelado, allow-list por company_id.
type: feature
---
- Arquivo isolado: `src/utils/tefAutoPrint.ts` (não tocar em `tefOrderActions.ts`, `pinpadService.ts`, `tef-webservice/`, `TefAdm`, `TefReport`).
- Allow-list interna `TEF_AUTO_PRINT_ALLOWED` — atualmente só Lancheria da I9 (`8c9e7a0e-dbb6-49b9-8344-c23155a71164`).
- Setting: `store_settings.tef_auto_print_vias` ∈ {`none`, `estabelecimento`, `ambas`}; default `ambas`.
- UI: card "Impressão automática do comprovante TEF" em Configurações → aba Impressão, visível só para o I9.
- Disparo: após `confirmPinpadTransaction` aprovado em `pdvV2Tef.ts` e `PedidoExpressDialog.tsx` (PinPad). SmartPOS ainda não envia receiptLines — não tem auto-print.
- Reimpressão manual (`reimprimirComprovanteTef`) segue independente e continua marcando como "2ª VIA / Reimpressão".
