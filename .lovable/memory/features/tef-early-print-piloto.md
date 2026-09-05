---
name: TEF Early Print piloto (Frente de Caixa)
description: v1.71.0-beta — vias do TEF impressas na aprovação do pinpad, em paralelo à NFC-e; piloto Cozinha da Ruiva + Lancheria I9
type: feature
---
`src/utils/frenteCaixaTefEarlyPrint.ts` (`isTefEarlyPrintPilot`, `imprimirViasTefImediato`): na Frente de Caixa, as vias TEF saem IMEDIATAMENTE após aprovação no pinpad, respeitando `tef_auto_print_vias`; fallback via iframe oculto quando `window.open` é bloqueado (gesto expirado).
- Piloto: Cozinha da Ruiva (55181771-…), Lancheria I9 (8c9e7a0e-…). Liberar geral = retornar true no helper.
- `FrenteCaixaPostSaleDialog` ganhou prop `tefAlreadyPrinted`: seção "Vias do TEF já impressas" + botão reimprimir; checkboxes nascem desmarcados.
- `silentAutoNfce` passa a desconsiderar TEF já impresso (modo auto + só NFC-e fica silencioso).
- Escopo: SOMENTE Frente de Caixa. TEF/PinPad/nfce-proxy congelados intocados; `buildHtml` de tefAutoPrint exportado como `buildTefViaHtml` (sem mudança de comportamento).
