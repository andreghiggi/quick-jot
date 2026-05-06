import { useState, useEffect, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { usePaymentMethods, PaymentChannel } from '@/hooks/usePaymentMethods';
import { brl as formatPrice, maskCurrencyInput, parseCurrencyInput, LANCHERIA_I9_COMPANY_ID } from './_format';
import { PDVV2DocumentModeSelector, DocumentMode } from './PDVV2DocumentModeSelector';
import { PDVV2AddItemSearch, ExtraItem } from './PDVV2AddItemSearch';
import { Plug, Loader2, Users, ListChecks, Printer } from 'lucide-react';
import { runTefPayment, type TefOptions } from '@/utils/pdvV2Tef';
import type { NFCeTefData } from '@/services/nfceService';
import { toast } from 'sonner';

interface PDVV2PaymentDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  total: number;
  title?: string;
  /** Itens para exibição visual no topo (apenas leitura, sem interação) */
  checkoutItems?: Array<{ name: string; quantity: number; unit_price: number; id?: string; paid?: boolean }>;
  /** Callback chamado após pagamento parcial de itens selecionados (I9 apenas) */
  onItemsPaid?: (itemIds: string[]) => void;
  /** Callback chamado após pagamento por divisão de pessoas (I9 apenas) */
  onSplitPaid?: (perPerson: number, totalPeople: number) => void;
  /** Show "Geração de Documentos" + "Impressão Automática" — habilitar para balcão/retirada/mesa */
  showDocumentMode?: boolean;
  /** Permite adicionar itens à cobrança (mesa importada / retirada) */
  showAddItem?: boolean;
  /** Canal das formas de pagamento. Default: 'pdv' */
  channel?: PaymentChannel;
  /** Restringir a apenas formas em dinheiro (oculta TEF e demais) */
  cashOnly?: boolean;
  /** Mensagem de status do processamento TEF (mostrada como banner topo). Vazio = oculto. */
  tefStatus?: string;
  /** When a split is already in progress (person 2+), the dialog auto-selects
   *  split mode with these pre-set values. The user cannot change the number
   *  of people or the per-person amount. */
  activeSplit?: { perPerson: number; totalPeople: number; currentPerson: number };
  /**
   * Quando true (e for I9), o TEF é executado AQUI — antes dos pop-ups de
   * CPF/Imprimir. Se a cobrança não for aprovada, nada é confirmado e o
   * fluxo é abortado. Usado pelo Pedido Express, onde o lojista deve
   * cobrar primeiro e só responder NFC-e/impressão após aprovação.
   */
  chargeTefBeforePopups?: boolean;
  onConfirm: (params: {
    paymentMethodId: string;
    paymentName: string;
    discount: number;
    finalTotal: number;
    documentMode: DocumentMode;
    extraItems: ExtraItem[];
    /** I9: usuário escolheu imprimir o documento gerado neste pop-up */
    printDocument?: boolean;
    /** Opções TEF quando a forma de pagamento é integração maquininha */
    tefOptions?: TefOptions;
    /** Tipo de integração TEF detectado (tef_pinpad | tef_smartpos) */
    tefIntegration?: 'tef_pinpad' | 'tef_smartpos';
    /** CPF/CNPJ do destinatário da NFC-e (apenas dígitos). Opcional. */
    customerDocument?: string;
    /**
     * Quando o TEF foi executado antes dos pop-ups (chargeTefBeforePopups),
     * o resultado já aprovado é enviado aqui pro chamador NÃO disparar TEF
     * novamente.
     */
    prechargedTef?: {
      tefData?: NFCeTefData;
      notesFragment?: string;
    };
    /** I9 split mode: info about the split so confirmImportTabI9 can use it directly */
    splitInfo?: { perPerson: number; totalPeople: number };
  }) => Promise<void> | void;
}

export function PDVV2PaymentDialog({
  open,
  onOpenChange,
  companyId,
  total,
  title = 'Cobrança',
  checkoutItems,
  onItemsPaid,
  onSplitPaid,
  showDocumentMode = false,
  showAddItem = false,
  channel = 'pdv',
  cashOnly = false,
  tefStatus,
  chargeTefBeforePopups = false,
  onConfirm,
  activeSplit,
}: PDVV2PaymentDialogProps) {
  // I9: advanced charge mode (selected items or split by people)
  const [i9Mode, setI9Mode] = useState<'' | 'items' | 'split'>('');
  const [selectedItemIdxs, setSelectedItemIdxs] = useState<Set<number>>(new Set());
  const [splitPeople, setSplitPeople] = useState(2);

  // When activeSplit is provided (person 2+), force split mode on open
  useEffect(() => {
    if (open && activeSplit) {
      setI9Mode('split');
      setSplitPeople(activeSplit.totalPeople);
    }
  }, [open, activeSplit]);

  const { activePaymentMethods: rawActivePaymentMethods } = usePaymentMethods({ companyId, channel });
  // Fallback: se não houver métodos cadastrados no canal PDV, lista TODOS os métodos
  // ativos da empresa (qualquer canal) para evitar que o operador veja apenas "Dinheiro"
  // por falta de configuração do canal.
  const { activePaymentMethods: allActivePaymentMethods } = usePaymentMethods({ companyId });
  const baseList =
    rawActivePaymentMethods.length > 0 ? rawActivePaymentMethods : allActivePaymentMethods;
  const activePaymentMethods = cashOnly
    ? baseList.filter((m) => /dinheiro/i.test(m.name))
    : baseList;
  // Rollout isolado: máscara de moeda em tempo real apenas para a Lancheria da I9.
  const useCurrencyMask = companyId === LANCHERIA_I9_COMPANY_ID;
  const isLancheriaI9 = companyId === LANCHERIA_I9_COMPANY_ID;
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [discount, setDiscount] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  // TEF (mesma UI/regra do PDV V1)
  const [tefModality, setTefModality] = useState<'avista' | 'parcelado' | 'debit' | 'pix'>('avista');
  const [tefInstallments, setTefInstallments] = useState('2');
  const [tefInstallmentType, setTefInstallmentType] = useState<'adm' | 'loja'>('adm');
  // CPF/CNPJ do consumidor (opcional) — vai para o destinatário da NFC-e
  const [customerDocument, setCustomerDocument] = useState('');
  const [documentMode, setDocumentMode] = useState<DocumentMode>(() => {
    const saved = localStorage.getItem('pdv_document_mode');
    return saved === 'sale_with_nfce' ? 'sale_with_nfce' : 'sale_only';
  });
  // Pop-ups Lancheria I9: etapa 1 (escolha de documento) → etapa 2 (imprimir?) → confirma
  const [docChoiceOpen, setDocChoiceOpen] = useState(false);
  const [printChoiceOpen, setPrintChoiceOpen] = useState(false);
  const [cpfChoiceOpen, setCpfChoiceOpen] = useState(false);
  const [pendingDocMode, setPendingDocMode] = useState<DocumentMode>('sale_only');
  // I9 — Diálogo único de confirmação NFC-e (substitui CPF + Imprimir).
  // Caminho rápido: 1 clique em "Emitir NFC-e" sem CPF e sem imprimir.
  const [nfceConfirmOpen, setNfceConfirmOpen] = useState(false);
  const [showCpfField, setShowCpfField] = useState(false);
  const [printAfterEmit, setPrintAfterEmit] = useState(false);
  // Resultado do TEF pré-cobrado (chargeTefBeforePopups). Mantemos em ref
  // pra propagar até o finalizeConfirm sem causar re-render desnecessário.
  const [prechargedTef, setPrechargedTef] = useState<{
    tefData?: NFCeTefData;
    notesFragment?: string;
  } | null>(null);
  const [internalTefStatus, setInternalTefStatus] = useState('');
  const [chargingTef, setChargingTef] = useState(false);

  // Detecta se o método selecionado é TEF — força NFC-e (mesma regra do V1)
  const selectedMethod = activePaymentMethods.find((m) => m.id === paymentMethodId);
  const integration = (selectedMethod as any)?.integration_type as string | undefined;
  const isTef = integration === 'tef_pinpad' || integration === 'tef_smartpos';
  const effectiveDocumentMode: DocumentMode = isTef ? 'sale_with_nfce' : documentMode;
  const isCash = !!selectedMethod && /dinheiro/i.test(selectedMethod.name);

  useEffect(() => {
    if (open && activePaymentMethods.length > 0 && !paymentMethodId) {
      setPaymentMethodId(activePaymentMethods[0].id);
    }
  }, [open, activePaymentMethods, paymentMethodId]);

  useEffect(() => {
    if (!open) {
      setDiscount('');
      setAmountReceived('');
      setSubmitting(false);
      setExtraItems([]);
      setDocChoiceOpen(false);
      setPrintChoiceOpen(false);
      setCpfChoiceOpen(false);
      setNfceConfirmOpen(false);
      setShowCpfField(false);
      setPrintAfterEmit(false);
      setTefModality('avista');
      setTefInstallments('2');
      setTefInstallmentType('adm');
      setCustomerDocument('');
      setPrechargedTef(null);
      setInternalTefStatus('');
      setChargingTef(false);
      setI9Mode('');
      setSelectedItemIdxs(new Set());
      setSplitPeople(2);
    }
  }, [open]);

  // Reset valor recebido ao trocar forma de pagamento
  useEffect(() => {
    setAmountReceived('');
  }, [paymentMethodId]);

  const extrasTotal = extraItems.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const grossTotal = total + extrasTotal;
  const discountValue = isLancheriaI9
    ? 0
    : useCurrencyMask
    ? parseCurrencyInput(discount)
    : parseFloat(discount.replace(',', '.')) || 0;

  // I9: calcular total baseado no modo selecionado
  const i9SelectedTotal = (() => {
    if (!isLancheriaI9 || i9Mode !== 'items' || !checkoutItems) return null;
    let sum = 0;
    selectedItemIdxs.forEach((idx) => {
      const it = checkoutItems[idx];
      if (it && !it.paid) sum += it.quantity * it.unit_price;
    });
    return sum;
  })();

  const i9SplitValue = (() => {
    if (!isLancheriaI9 || i9Mode !== 'split' || splitPeople < 1) return null;
    return grossTotal / splitPeople;
  })();

  const finalTotal = (() => {
    if (i9SelectedTotal !== null) return Math.max(0, i9SelectedTotal);
    if (i9SplitValue !== null) return Math.max(0, i9SplitValue);
    return Math.max(0, grossTotal - discountValue);
  })();

  const receivedValue = useCurrencyMask
    ? parseCurrencyInput(amountReceived)
    : parseFloat(amountReceived.replace(',', '.')) || 0;
  const change = isCash ? Math.max(0, receivedValue - finalTotal) : 0;

  async function finalizeConfirm(docMode: DocumentMode, printDocument?: boolean) {
    const method = activePaymentMethods.find((m) => m.id === paymentMethodId);
    if (!method) return;
    const tefOptions: TefOptions | undefined = isTef
      ? {
          modality: tefModality,
          installments: tefModality === 'parcelado' ? parseInt(tefInstallments) || 2 : undefined,
          installmentType: tefInstallmentType,
        }
      : undefined;
    const cleanDoc = customerDocument.replace(/\D/g, '');
    const isNfce = docMode === 'sale_with_nfce' || isTef;
    setSubmitting(true);
    console.log('[SPLIT-DEBUG] finalizeConfirm calling onConfirm', { i9Mode, splitInfo: isLancheriaI9 && i9Mode === 'split' ? { perPerson: finalTotal, totalPeople: splitPeople } : undefined, finalTotal, grossTotal });
    await onConfirm({
      paymentMethodId,
      paymentName: method.name,
      discount: discountValue,
      finalTotal,
      documentMode: docMode,
      extraItems,
      printDocument,
      tefOptions,
      tefIntegration: isTef ? (integration as 'tef_pinpad' | 'tef_smartpos') : undefined,
      customerDocument: isNfce && (cleanDoc.length === 11 || cleanDoc.length === 14) ? cleanDoc : undefined,
      prechargedTef: prechargedTef ?? undefined,
      splitInfo: isLancheriaI9 && i9Mode === 'split' ? { perPerson: finalTotal, totalPeople: splitPeople } : undefined,
    });
    // I9: callbacks pós-pagamento
    if (isLancheriaI9 && i9Mode === 'items' && checkoutItems) {
      const paidIds = Array.from(selectedItemIdxs)
        .map((idx) => checkoutItems[idx]?.id)
        .filter((id): id is string => !!id);
      if (paidIds.length > 0) onItemsPaid?.(paidIds);
    }
    setSubmitting(false);
  }

  async function handleConfirm() {
    const method = activePaymentMethods.find((m) => m.id === paymentMethodId);
    if (!method) return;
    // ===== I9 + Pedido Express: cobrar TEF ANTES dos pop-ups =====
    // Se a cobrança não for aprovada, abortamos e o lojista pode tentar de novo
    // (ou trocar a forma) sem ter respondido NFC-e/impressão à toa.
    if (
      chargeTefBeforePopups &&
      isLancheriaI9 &&
      isTef &&
      companyId &&
      !prechargedTef
    ) {
      const tefOptions: TefOptions = {
        modality: tefModality,
        installments:
          tefModality === 'parcelado' ? parseInt(tefInstallments) || 2 : undefined,
        installmentType: tefInstallmentType,
      };
      setChargingTef(true);
      setInternalTefStatus('Iniciando cobrança TEF...');
      try {
        const result = await runTefPayment({
          companyId,
          integration: integration as 'tef_pinpad' | 'tef_smartpos',
          amount: finalTotal,
          options: tefOptions,
          onStatus: (msg) => setInternalTefStatus(msg),
        });
        if (!result.success) {
          // toast já exibido pelo helper; aborta sem seguir pra NFC-e/impressão
          setChargingTef(false);
          setInternalTefStatus('');
          return;
        }
        setPrechargedTef({
          tefData: result.tefData,
          notesFragment: result.notesFragment,
        });
        setChargingTef(false);
        setInternalTefStatus('');
        toast.success('Pagamento aprovado. Confirme os dados da nota.');
      } catch (e: any) {
        console.error('[PDVV2PaymentDialog] TEF pre-charge error:', e);
        toast.error(`Erro TEF: ${e?.message || 'falha na cobrança'}`);
        setChargingTef(false);
        setInternalTefStatus('');
        return;
      }
      // TEF aprovado → segue para os pop-ups (CPF + Imprimir)
      if (showDocumentMode) {
        // I9 com NFC-e forçada por TEF: diálogo único de confirmação
        setPendingDocMode('sale_with_nfce');
        setNfceConfirmOpen(true);
      } else {
        await finalizeConfirm('sale_with_nfce');
      }
      return;
    }

    // I9 + showDocumentMode: abre pop-ups em sequência. TEF força NFC-e e pula pop-up 1.
    if (isLancheriaI9 && showDocumentMode) {
      if (isTef) {
        setPendingDocMode('sale_with_nfce');
        setNfceConfirmOpen(true);
      } else {
        setDocChoiceOpen(true);
      }
      return;
    }
    // Demais empresas: se a venda sair com NFC-e (ou TEF), abrir popup de CPF antes
    if (effectiveDocumentMode === 'sale_with_nfce' || isTef) {
      setPendingDocMode('sale_with_nfce');
      setCpfChoiceOpen(true);
      return;
    }
    await finalizeConfirm(effectiveDocumentMode);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting && !chargingTef) onOpenChange(o); }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (submitting || chargingTef) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (submitting || chargingTef) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {(tefStatus || internalTefStatus) && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm">{tefStatus || internalTefStatus}</p>
              <p className="text-xs text-muted-foreground">Operação TEF em andamento. Aguarde a confirmação na maquininha.</p>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          {!isLancheriaI9 && <div className="rounded-md border p-3 bg-muted/40">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(finalTotal)}</p>
            {(discountValue > 0 || extrasTotal > 0) && (
              <p className="text-xs text-muted-foreground">
                Subtotal: {formatPrice(total)}
                {extrasTotal > 0 && ` + Itens: ${formatPrice(extrasTotal)}`}
                {discountValue > 0 && ` − Desconto: ${formatPrice(discountValue)}`}
              </p>
            )}
          </div>}

          {isLancheriaI9 && checkoutItems && checkoutItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Itens</p>
              <div className="max-h-[6.5rem] overflow-y-auto space-y-0.5">
                {checkoutItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm px-1">
                    <span className="truncate mr-2">{item.quantity}x {item.name}</span>
                    <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatPrice(item.quantity * item.unit_price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showAddItem && (
            <PDVV2AddItemSearch
              companyId={companyId}
              items={extraItems}
              onChange={setExtraItems}
            />
          )}

          {isLancheriaI9 && checkoutItems && checkoutItems.length > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                if (!checkoutItems?.length) return;
                const { printOnlyReceipt } = await import('@/utils/pdvV2Print');
                await printOnlyReceipt({
                  companyId: companyId || '',
                  orderCode: title || 'Comanda',
                  dailyNumber: 0,
                  customerName: title || 'Comanda',
                  items: checkoutItems.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    price: i.unit_price,
                  })),
                  total: total,
                });
                toast.success('Comanda enviada para impressão!');
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir comanda
            </Button>
          )}

          {/* I9: opções de cobrança avançada */}
          {isLancheriaI9 && checkoutItems && checkoutItems.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Modo de cobrança</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={i9Mode === 'items' ? 'default' : 'outline'}
                  onClick={() => {
                    setI9Mode(i9Mode === 'items' ? '' : 'items');
                    setSelectedItemIdxs(new Set());
                  }}
                  className="gap-1"
                >
                  <ListChecks className="w-4 h-4" />
                  Itens selecionados
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={i9Mode === 'split' ? 'default' : 'outline'}
                  onClick={() => {
                    setI9Mode(i9Mode === 'split' ? '' : 'split');
                    setSplitPeople(2);
                  }}
                  className="gap-1"
                >
                  <Users className="w-4 h-4" />
                  Dividir por pessoas
                </Button>
              </div>

              {/* Opção A — selecionar itens */}
              {i9Mode === 'items' && (
                <div className="max-h-[8rem] overflow-y-auto space-y-1 border rounded-md p-2">
                  {checkoutItems.map((item, idx) => {
                    const isPaid = !!item.paid;
                    const isSelected = selectedItemIdxs.has(idx);
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 text-sm px-1 py-0.5 rounded ${
                          isPaid ? 'opacity-60 bg-green-50 dark:bg-green-950/30' : ''
                        }`}
                      >
                        <Checkbox
                          checked={isPaid || isSelected}
                          disabled={isPaid}
                          onCheckedChange={(c) => {
                            const next = new Set(selectedItemIdxs);
                            if (c) next.add(idx);
                            else next.delete(idx);
                            setSelectedItemIdxs(next);
                          }}
                        />
                        <span className="truncate flex-1">
                          {item.quantity}x {item.name}
                          {isPaid && <span className="ml-1 text-xs text-green-600">(pago)</span>}
                        </span>
                        <span className="tabular-nums text-muted-foreground whitespace-nowrap text-xs">
                          {formatPrice(item.quantity * item.unit_price)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Opção B — dividir por pessoas */}
              {i9Mode === 'split' && (
                <div className="space-y-2 border rounded-md p-2">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm whitespace-nowrap">Nº de pessoas</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={splitPeople}
                      onChange={(e) => setSplitPeople(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-8 w-20"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Valor por pessoa: <span className="font-semibold text-foreground">{formatPrice(grossTotal / Math.max(1, splitPeople))}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {!isLancheriaI9 && (
            <div className="space-y-2">
              <Label>Desconto (R$)</Label>
              <Input
                type={useCurrencyMask ? 'text' : 'number'}
                inputMode="decimal"
                step={useCurrencyMask ? undefined : '0.01'}
                placeholder={useCurrencyMask ? 'R$ 0,00' : '0,00'}
                value={discount}
                onChange={(e) =>
                  setDiscount(useCurrencyMask ? maskCurrencyInput(e.target.value) : e.target.value)
                }
              />
            </div>
          )}

          {isLancheriaI9 && <div className="rounded-md border p-3 bg-muted/40">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(finalTotal)}</p>
            {(discountValue > 0 || extrasTotal > 0) && (
              <p className="text-xs text-muted-foreground">
                Subtotal: {formatPrice(total)}
                {extrasTotal > 0 && ` + Itens: ${formatPrice(extrasTotal)}`}
                {discountValue > 0 && ` − Desconto: ${formatPrice(discountValue)}`}
              </p>
            )}
          </div>}

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            {activePaymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma forma de pagamento ativa para o canal PDV.
              </p>
            ) : (
              <RadioGroup value={paymentMethodId} onValueChange={setPaymentMethodId}>
                {activePaymentMethods.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 border rounded-md p-2">
                    <RadioGroupItem value={m.id} id={`pm-${m.id}`} />
                    <Label htmlFor={`pm-${m.id}`} className="flex-1 cursor-pointer">
                      {m.name}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>

          {isCash && (
            <div className="space-y-2">
              <Label>Valor recebido (R$)</Label>
              <Input
                type={useCurrencyMask ? 'text' : 'number'}
                inputMode="decimal"
                step={useCurrencyMask ? undefined : '0.01'}
                placeholder={useCurrencyMask ? 'R$ 0,00' : '0,00'}
                value={amountReceived}
                onChange={(e) =>
                  setAmountReceived(
                    useCurrencyMask ? maskCurrencyInput(e.target.value) : e.target.value,
                  )
                }
                autoFocus
              />
              <div className="rounded-md border p-3 bg-muted/40 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Troco</span>
                <span className="text-xl font-bold tabular-nums">
                  {formatPrice(change)}
                </span>
              </div>
              {receivedValue > 0 && receivedValue < finalTotal && (
                <p className="text-xs text-destructive">
                  Valor recebido menor que o total.
                </p>
              )}
            </div>
          )}

          {isTef && (
            <div className="p-3 border border-primary/30 bg-primary/5 rounded-lg space-y-3">
              <p className="text-sm font-medium flex items-center gap-1">
                <Plug className="w-4 h-4 text-primary" />
                Opções TEF
              </p>
              <div>
                <Label className="mb-2 block text-xs">Modalidade</Label>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={tefModality === 'avista' ? 'default' : 'outline'}
                    onClick={() => setTefModality('avista')}
                  >
                    À Vista
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tefModality === 'debit' ? 'default' : 'outline'}
                    onClick={() => setTefModality('debit')}
                  >
                    Débito
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tefModality === 'parcelado' ? 'default' : 'outline'}
                    onClick={() => setTefModality('parcelado')}
                  >
                    Parcelado
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tefModality === 'pix' ? 'default' : 'outline'}
                    onClick={() => setTefModality('pix')}
                  >
                    PIX
                  </Button>
                </div>
              </div>
              {tefModality === 'parcelado' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Parcelamento</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={tefInstallmentType === 'loja' ? 'default' : 'outline'}
                        onClick={() => setTefInstallmentType('loja')}
                        className="flex-1"
                      >
                        Loja
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={tefInstallmentType === 'adm' ? 'default' : 'outline'}
                        onClick={() => setTefInstallmentType('adm')}
                        className="flex-1"
                      >
                        ADM
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tefInstallmentType === 'loja'
                        ? 'Loja: juros por conta do lojista'
                        : 'ADM: juros por conta do cliente'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Parcelas</Label>
                    <Input
                      type="number"
                      min={2}
                      max={18}
                      value={tefInstallments}
                      onChange={(e) => setTefInstallments(e.target.value)}
                      className="h-9"
                    />
                    {parseInt(tefInstallments) >= 2 && (
                      <p className="text-xs text-muted-foreground">
                        {tefInstallments}x de {formatPrice(finalTotal / (parseInt(tefInstallments) || 2))}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs text-destructive">
                ⚠️ NFC-e obrigatória para pagamentos com TEF
              </p>
            </div>
          )}

          {showDocumentMode && !isLancheriaI9 && (
            <PDVV2DocumentModeSelector
              companyId={companyId}
              value={documentMode}
              onChange={setDocumentMode}
              forceNFCe={isTef}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || chargingTef || !paymentMethodId || activePaymentMethods.length === 0}
          >
            {chargingTef ? 'Cobrando…' : 'Confirmar Pagamento'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Lancheria I9 — Pop-up 1: Geração de Documentos */}
      <Dialog open={docChoiceOpen} onOpenChange={setDocChoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Geração de Documentos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <Button
              size="lg"
              variant="outline"
              className="h-16 text-base"
              onClick={() => {
                setPendingDocMode('sale_only');
                setDocChoiceOpen(false);
                setPrintChoiceOpen(true);
              }}
            >
              Somente Venda
            </Button>
            <Button
              size="lg"
              className="h-16 text-base"
              onClick={() => {
                setPendingDocMode('sale_with_nfce');
                setDocChoiceOpen(false);
                setNfceConfirmOpen(true);
              }}
            >
              Venda com NFC-e
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lancheria I9 — Pop-up 2: Imprimir documento? */}
      <Dialog open={printChoiceOpen} onOpenChange={setPrintChoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Imprimir {pendingDocMode === 'sale_with_nfce' ? 'NFC-e' : 'recibo de venda'}?
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Button
              size="lg"
              variant="outline"
              className="h-16 text-base"
              onClick={async () => {
                setPrintChoiceOpen(false);
                await finalizeConfirm(pendingDocMode, false);
              }}
            >
              Não imprimir
            </Button>
            <Button
              size="lg"
              className="h-16 text-base"
              onClick={async () => {
                setPrintChoiceOpen(false);
                await finalizeConfirm(pendingDocMode, true);
              }}
            >
              Imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pop-up CPF/CNPJ na nota — abre antes da emissão da NFC-e */}
      <Dialog open={cpfChoiceOpen} onOpenChange={setCpfChoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>CPF/CNPJ na nota?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="cpf-cnpj-popup">CPF ou CNPJ do consumidor (opcional)</Label>
            <Input
              id="cpf-cnpj-popup"
              inputMode="numeric"
              placeholder="Somente números"
              value={customerDocument}
              onChange={(e) => setCustomerDocument(e.target.value.replace(/[^\d./-]/g, ''))}
              maxLength={18}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Em branco = NFC-e sem destinatário (consumidor não identificado).
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCustomerDocument('');
                setCpfChoiceOpen(false);
                if (isLancheriaI9 && showDocumentMode) {
                  setPrintChoiceOpen(true);
                } else {
                  finalizeConfirm(pendingDocMode);
                }
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                // Se o operador não digitou CPF/CNPJ, segue como "Sem CPF"
                // (NFC-e sem destinatário). Caso contrário, usa o que foi digitado.
                setCpfChoiceOpen(false);
                if (isLancheriaI9 && showDocumentMode) {
                  setPrintChoiceOpen(true);
                } else {
                  finalizeConfirm(pendingDocMode);
                }
              }}
            >
              Próxima
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* I9 — Diálogo único de confirmação NFC-e (CPF opcional + imprimir opcional) */}
      <Dialog open={nfceConfirmOpen} onOpenChange={setNfceConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Emitir NFC-e — {formatPrice(finalTotal)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!showCpfField ? (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowCpfField(true)}
              >
                + Adicionar CPF/CNPJ (opcional)
              </Button>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cpf-cnpj-nfce">CPF ou CNPJ do consumidor</Label>
                <Input
                  id="cpf-cnpj-nfce"
                  inputMode="numeric"
                  placeholder="Somente números"
                  value={customerDocument}
                  onChange={(e) => setCustomerDocument(e.target.value.replace(/[^\d./-]/g, ''))}
                  maxLength={18}
                  autoFocus
                />
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => {
                    setCustomerDocument('');
                    setShowCpfField(false);
                  }}
                >
                  Remover CPF/CNPJ
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox
                id="print-after-emit"
                checked={printAfterEmit}
                onCheckedChange={(c) => setPrintAfterEmit(c === true)}
              />
              <Label htmlFor="print-after-emit" className="cursor-pointer text-sm font-normal">
                Imprimir DANFE após emissão
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setNfceConfirmOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              autoFocus
              disabled={submitting}
              onClick={async () => {
                setNfceConfirmOpen(false);
                await finalizeConfirm(pendingDocMode, printAfterEmit);
              }}
            >
              Emitir NFC-e
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
