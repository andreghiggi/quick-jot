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
- v1.1: NÃO imprime mais sozinho. `imprimirComprovanteTefAutomatico` dispara o evento `tef-auto-print-prompt`; o componente global `<TefPrintPromptDialog />` (montado em `App.tsx`) abre um modal com 3 opções (Ambas / Só Estabelecimento / Não imprimir). A opção pré-marcada vem do setting `tef_auto_print_vias`. A impressão real fica em `executarImpressaoTefVias`.
- Reimpressão manual (`reimprimirComprovanteTef`) segue independente e continua marcando como "2ª VIA / Reimpressão".
