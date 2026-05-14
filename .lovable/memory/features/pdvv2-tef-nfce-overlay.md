---
name: PDV V2 TEF/NFC-e overlay serialization (I9)
description: Lancheria I9 — overlay "Emitindo NFC-e" não bloqueante e PostSaleDialog adiado até o prompt TEF fechar
type: feature
---
PDV V2 (apenas Lancheria I9, companyId 8c9e7a0e-dbb6-49b9-8344-c23155a71164):
- Overlay full-screen `isEmittingNfce` substituído por indicador discreto no canto inferior direito (`pointer-events-none`).
- `TefPrintPromptDialog` dispara `tef-auto-print-prompt-opened` ao abrir e `TEF_PRINT_PROMPT_CLOSED_EVENT` (`tef-auto-print-prompt-closed`) ao fechar.
- `PDVV2.tsx` escuta esses eventos via `tefPromptOpen`. Quando `emitNFCeAndOpenDialog` resolve com `tefPromptOpen=true`, marca `pendingNfceOpen=true` e adia `setNfceDialogOpen(true)` até o prompt TEF fechar.
- Outras lojas mantêm o overlay bloqueante e abertura imediata do PostSaleDialog — comportamento legado intacto.
