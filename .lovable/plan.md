# Comprovante do TEF sai na hora (Frente de Caixa — piloto)

Hoje, na Frente de Caixa, as vias do cartão só são impressas no diálogo final, depois que a nota fiscal resolve. Quando a nota demora, o comprovante — que já estava pronto no segundo em que o pagamento foi aprovado — espera junto. Resultado: 40 s a 1 min de sensação de travamento.

A mudança: assim que o pinpad aprova, as vias do TEF vão direto para a impressora. A nota continua sendo emitida em paralelo e o DANFE sai quando a SEFAZ autorizar.

## Lojas do piloto

- Cozinha da Ruiva
- Lancheria da I9

Todas as demais lojas continuam exatamente com o comportamento atual.

### Impacto se fosse liberado para todas as lojas (avaliação)

O risco é baixo e a arquitetura já permite liberar geral depois:

- A mudança só existe na **Frente de Caixa** — PDV V2, Pedido Express e cobrança por card não são tocados.
- Cada loja mantém sua preferência `tef_auto_print_vias`: quem usa "não imprimir" não sente diferença.
- Arquivos congelados (TEF/PinPad/nfce-proxy) não são alterados em nenhum cenário.
- **Risco real para rollout geral:** na impressão imediata o gesto do clique já expirou (~transient activation), então o Chrome pode bloquear o pop-up de impressão em alguns caixas. Por isso o plano inclui fallback de impressão via iframe oculto quando `window.open` é bloqueado.
- Validação: 2–3 dias de piloto; a liberação geral é remover a verificação de IDs no helper (1 linha), sem novo código.

## Comportamento novo (só no piloto)

1. Pagamento aprovado no pinpad → vias do TEF impressas imediatamente, usando a preferência já configurada da loja (ambas as vias / só estabelecimento / nenhuma).
2. Emissão da nota segue em paralelo, sem nenhuma alteração de prazo, contingência ou numeração.
3. Diálogo final passa a tratar só do DANFE. A seção do TEF aparece como "vias já impressas", com um botão de reimprimir caso o papel tenha falhado.
4. Se a preferência da loja for "não imprimir", nada muda: o operador continua decidindo no diálogo.

## Detalhes técnicos

- Novo arquivo `src/utils/frenteCaixaTefEarlyPrint.ts`:
  - `TEF_EARLY_PRINT_PILOT_IDS` = `55181771-8b10-4af1-afc3-472c090a49be` (Cozinha da Ruiva), `8c9e7a0e-dbb6-49b9-8344-c23155a71164` (Lancheria da I9).
  - `isTefEarlyPrintPilot(companyId?: string | null): boolean`.
  - `imprimirViasTefImediato(payload: TefPrintPromptPayload): Promise<boolean>` — retorna `false` quando `defaultMode === 'none'` ou não há `receiptLines`; caso contrário chama `executarImpressaoTefVias(receiptLines, defaultMode, orderCode)` dentro de try/catch (best-effort, nunca derruba o fluxo da venda).
  - **Fallback de pop-up bloqueado:** como a impressão acontece sem gesto do operador (o clique em "Cobrar" já expirou após o pinpad), se `window.open` retornar `null`, imprime via iframe oculto (`document.createElement('iframe')` + `contentWindow.print()`), mesma técnica já usada como fallback do DANFE. Se ambos falharem, o diálogo final continua oferecendo a impressão manual das vias.
- `src/pages/FrenteCaixa.tsx`, bloco `useConsolidatedPostSale` do `handleConfirmPayment` (por volta da linha 1096):
  - após ler `tefCapturedRef.current`, se `isTefEarlyPrintPilot(company?.id)` e houver vias, dispara `imprimirViasTefImediato` **antes** de iniciar a emissão da NFC-e (sem `await` bloqueante do fluxo fiscal).
  - quando a impressão antecipada acontece: passa `consolidatedTef` mantendo as linhas, mas com nova prop `tefAlreadyPrinted` para o diálogo; e o cálculo de `silentAutoNfce` passa a desconsiderar `hasTef` (modo `auto` + só NFC-e volta a ser silencioso, sem diálogo desnecessário).
  - se não houver NFC-e (`hasNfce === false`) e as vias já saíram, nenhum diálogo é aberto.
- `src/components/frente-caixa/FrenteCaixaPostSaleDialog.tsx`: nova prop opcional `tefAlreadyPrinted?: boolean`. Quando `true`, os checkboxes de via nascem desmarcados, a seção mostra "Vias do TEF já impressas" e um botão secundário "Reimprimir vias" chamando `executarImpressaoTefVias`. Sem a prop, o componente segue idêntico.
- Bump em `src/version.ts` + entrada no changelog.

## Fora do escopo (intocado)

`tef-webservice`, `pinpadService.ts`, `pdvV2Tef.ts`, `tefOrderActions.ts`, `nfce-proxy` (timeouts, contingência, abortar-online, idempotência), `PDVV2NFCePostSaleDialog`, `TefPrintPromptDialog`, `PedidoExpressDialog`, `OrderCardChargeDialog`, `PDVV2.tsx`, `external_id` `FCX-{saleId}`, numeração fiscal e payload da NFC-e.
