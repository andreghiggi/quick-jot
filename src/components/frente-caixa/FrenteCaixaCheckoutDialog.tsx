import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowLeft, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';
import {
  runMultiPayment,
  type MultiPaymentInputLine,
  type MultiPaymentResolvedLine,
} from '@/utils/pdvV2MultiPayment';
import { FrenteCaixaCustomerDialog } from './FrenteCaixaCustomerDialog';

/**
 * "Finalizando venda" — tela de checkout da Frente de Caixa (módulo mercado).
 *
 * Inspirada no PDV do Gweb: 2 colunas (resumo financeiro + wizard de 3 etapas),
 * multi-pagamento nativo com atalhos por letra, contador "Falta" e SALVAR só
 * quando Falta = 0.
 *
 * Isolada: NÃO altera PDV V2, Pedido Express, OrderCardChargeDialog,
 * PDVV2PaymentDialog/MultiPaymentDialog nem TEF v1.0/v1.1/v1.2-beta.
 * Reaproveita `runMultiPayment` (v1.6) — engine já homologada.
 */

export interface FrenteCaixaCheckoutItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface FrenteCaixaCheckoutResult {
  paymentMethodId: string;
  paymentName: string;
  discount: number;
  surcharge: number;
  finalTotal: number;
  customerName?: string;
  customerPhone?: string;
  customerDocument?: string;
  notes?: string;
  combinedNotesFragment?: string;
  /** Fase 1: indica se a venda deve ser registrada com NFC-e ou como pré-venda. */
  fiscalMode: 'fiscal' | 'nao_fiscal';
  /** Linhas resolvidas do multi-pagamento — usado para montar `pagamentos_split` da NFC-e. */
  mpLines: MultiPaymentResolvedLine[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  items: FrenteCaixaCheckoutItem[];
  /** Soma dos itens (passada pelo caller para evitar recomputar). */
  itemsTotal: number;
  /** Fase 1: comportamento padrão do botão SALVAR (Configurações → Comportamento). */
  defaultFiscalMode?: 'fiscal' | 'nao_fiscal' | 'ask';
  /**
   * Chamado quando o operador clicar SALVAR e todas as cobranças (incluindo
   * TEF) foram aprovadas. O caller é responsável por persistir a venda via
   * `useCashRegister.addSale`.
   */
  onConfirm: (result: FrenteCaixaCheckoutResult) => Promise<void> | void;
}

type StepId = 1 | 2 | 3;

interface LineState {
  /** Texto digitado pelo operador (mascarado em R$). */
  text: string;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function FrenteCaixaCheckoutDialog({
  open,
  onOpenChange,
  companyId,
  items,
  itemsTotal,
  defaultFiscalMode = 'ask',
  onConfirm,
}: Props) {
  const { activePaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });

  const [step, setStep] = useState<StepId>(1);
  const [discountText, setDiscountText] = useState('');
  const [surchargeText, setSurchargeText] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [lines, setLines] = useState<Record<string, LineState>>({});

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [notes, setNotes] = useState('');
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // refs dos inputs de pagamento (pra foco por atalho A/B/C…)
  const lineRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const adjustRef = useRef<HTMLInputElement | null>(null);

  const discount = parseCurrencyInput(discountText);
  const surcharge = parseCurrencyInput(surchargeText);
  const total = Math.max(0, itemsTotal - discount + surcharge);

  const allocated = useMemo(
    () =>
      activePaymentMethods.reduce(
        (sum, m) => sum + parseCurrencyInput(lines[m.id]?.text || ''),
        0,
      ),
    [lines, activePaymentMethods],
  );
  const remaining = Math.max(0, total - allocated);
  const over = allocated > total + 0.005;
  const exact = total > 0 && Math.abs(allocated - total) < 0.005;

  // reset ao abrir
  useEffect(() => {
    if (open) {
      setStep(1);
      setLines({});
      setDiscountText('');
      setSurchargeText('');
      setShowAdjust(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerDocument('');
      setNotes('');
      setCustomerDialogOpen(false);
      setProcessing(false);
      setProcessingStatus('');
    }
  }, [open]);

  // foco inicial no primeiro método quando entra na etapa 1 (uma vez por entrada)
  useEffect(() => {
    if (!open || step !== 1) return;
    const firstId = activePaymentMethods[0]?.id;
    if (!firstId) return;
    const t = setTimeout(() => lineRefs.current[firstId]?.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  function focusMethodByIndex(idx: number) {
    const m = activePaymentMethods[idx];
    if (!m) return;
    const el = lineRefs.current[m.id];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function updateLine(methodId: string, text: string) {
    setLines((prev) => ({ ...prev, [methodId]: { text: maskCurrencyInput(text) } }));
  }

  function fillRemainingOnLine(methodId: string) {
    const current = parseCurrencyInput(lines[methodId]?.text || '');
    const target = current + remaining;
    if (target <= 0) return;
    setLines((prev) => ({
      ...prev,
      [methodId]: {
        text: maskCurrencyInput(target.toFixed(2).replace('.', ',')),
      },
    }));
  }

  // ===== atalhos =====
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (processing) return;
      // não capturar atalhos enquanto o modal de cliente está aberto
      if (customerDialogOpen) return;
      // Ctrl + 1/2/3 → etapas
      if (e.ctrlKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        setStep(Number(e.key) as StepId);
        return;
      }
      // Esc → fechar (com confirmação se houver algo alocado)
      if (e.key === 'Escape') {
        e.preventDefault();
        if (allocated > 0) {
          if (window.confirm('Descartar pagamentos digitados e voltar?')) {
            onOpenChange(false);
          }
        } else {
          onOpenChange(false);
        }
        return;
      }
      // Home → desconto/acréscimo
      if (e.key === 'Home' && step === 1) {
        e.preventDefault();
        setShowAdjust((v) => !v);
        setTimeout(() => adjustRef.current?.focus(), 50);
        return;
      }
      // Enter → avança etapa (ou salva na 3)
      if (e.key === 'Enter') {
        const target = document.activeElement as HTMLElement | null;
        const isTextarea = target?.tagName === 'TEXTAREA';
        if (isTextarea) return; // permitir quebra de linha em observação
        if (step === 1) {
          // Na etapa 1, Enter NUNCA avança automaticamente.
          // O handler do input cuida de auto-preencher o valor.
          // Para avançar, usar o botão "Próximo" ou Ctrl+2.
          return;
        }
        if (step === 2) {
          e.preventDefault();
          setStep(3);
          return;
        }
        if (step === 3) {
          e.preventDefault();
          if (exact && !processing) handleSave();
          return;
        }
      }
      // Letras A..Z → foca método correspondente (somente etapa 1)
      if (
        step === 1 &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.length === 1 &&
        /[a-zA-Z]/.test(e.key)
      ) {
        const target = document.activeElement as HTMLElement | null;
        const isTyping =
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
        // permite trocar de forma de pagamento mesmo digitando em um input de valor
        const idx = LETTERS.indexOf(e.key.toUpperCase());
        if (idx >= 0 && idx < activePaymentMethods.length) {
          e.preventDefault();
          focusMethodByIndex(idx);
          return;
        }
        if (isTyping) return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, processing, allocated, activePaymentMethods, exact, customerDialogOpen]);

  // ===== salvar =====
  async function handleSave(fiscalChoice?: 'fiscal' | 'nao_fiscal') {
    if (!companyId) return;
    if (!exact) {
      toast.error('O valor pago precisa ser igual ao total.');
      return;
    }
    const fiscalMode: 'fiscal' | 'nao_fiscal' =
      fiscalChoice ?? (defaultFiscalMode === 'ask' ? 'nao_fiscal' : defaultFiscalMode);
    setProcessing(true);
    setProcessingStatus('Processando pagamentos…');
    try {
      // Monta linhas para runMultiPayment
      const mpLines: MultiPaymentInputLine[] = activePaymentMethods
        .map((m) => {
          const amount = parseCurrencyInput(lines[m.id]?.text || '');
          if (amount <= 0) return null;
          const itg = (m as any).integration_type as string | undefined;
          const isTef = itg === 'tef_pinpad' || itg === 'tef_smartpos';
          return {
            payment_method_id: m.id,
            payment_name: m.name,
            amount,
            integration: isTef ? (itg as 'tef_pinpad' | 'tef_smartpos') : undefined,
            tef_options: isTef ? { modality: 'avista' as const } : undefined,
          } as MultiPaymentInputLine;
        })
        .filter((l): l is MultiPaymentInputLine => l !== null);

      if (mpLines.length === 0) {
        toast.error('Nenhuma forma de pagamento informada.');
        return;
      }

      const mp = await runMultiPayment({
        companyId,
        lines: mpLines,
        description: customerName ? `Frente de Caixa - ${customerName}` : 'Frente de Caixa',
        onStatus: setProcessingStatus,
      });

      if (!mp.ok || !mp.primary) {
        const extra = mp.rolledBackCount
          ? ` (${mp.rolledBackCount} cobrança(s) estornada(s))`
          : '';
        toast.error((mp.errorMessage || 'Cobrança recusada') + extra);
        return;
      }

      await onConfirm({
        paymentMethodId: mp.primary.payment_method_id,
        paymentName: mp.primary.payment_name,
        discount,
        surcharge,
        finalTotal: total,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerDocument: customerDocument.trim() || undefined,
        notes: notes.trim() || undefined,
        combinedNotesFragment: mp.combinedNotesFragment,
        fiscalMode,
        mpLines: mp.lines || [],
      });
    } catch (err: any) {
      console.error('[FrenteCaixaCheckout] error:', err);
      toast.error(err?.message || 'Erro ao processar venda.');
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  }

  // ===== render =====
  return (
    <Dialog open={open} onOpenChange={(o) => !processing && onOpenChange(o)}>
      <DialogContent
        className="max-w-6xl w-[95vw] h-[90dvh] p-0 gap-0 overflow-hidden bg-background text-foreground border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold">Finalizando venda</h2>
          <button
            type="button"
            onClick={() => !processing && onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {processingStatus && (
          <div className="bg-primary/10 border-b border-primary/30 px-6 py-2 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{processingStatus}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] min-h-0 overflow-hidden">
          {/* Coluna esquerda — resumo */}
          <div className="border-r border-border p-4 overflow-auto">
            <div className="rounded-lg bg-muted/40 border border-border divide-y divide-border">
              <SummaryRow label="Total dos produtos" value={brl(itemsTotal)} />
              <SummaryRow label="Total de desconto" value={brl(discount)} />
              <SummaryRow label="Total de acréscimo" value={brl(surcharge)} />
              <SummaryRow
                label="Total geral"
                value={brl(total)}
                emphasize
              />
            </div>

            <div className="mt-4 text-[11px] text-muted-foreground space-y-1 leading-snug">
              <p>
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">Ctrl</kbd>{' '}
                +{' '}
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">1/2/3</kbd>{' '}
                muda de etapa.
              </p>
              <p>
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">A–Z</kbd>{' '}
                foca a forma de pagamento.
              </p>
              <p>
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">Home</kbd>{' '}
                abre Desconto/Acréscimo.
              </p>
              <p>
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">Esc</kbd>{' '}
                volta.
              </p>
            </div>
          </div>

          {/* Coluna direita — wizard */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Etapa 1 */}
              <StepHeader
                num={1}
                label="Pagamentos"
                shortcut="Ctrl+1"
                active={step === 1}
                onClick={() => setStep(1)}
              />
              {step === 1 && (
                <div className="ml-9 space-y-3">
                  {activePaymentMethods.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma forma de pagamento cadastrada para o canal PDV.
                    </p>
                  )}
                  <ul className="divide-y divide-border border-y border-border">
                    {activePaymentMethods.map((m, idx) => {
                      const letter = LETTERS[idx] || '';
                      const itg = (m as any).integration_type as string | undefined;
                      const isTef = itg === 'tef_pinpad' || itg === 'tef_smartpos';
                      return (
                        <li key={m.id} className="flex items-center gap-3 py-3">
                          <span className="flex-1 flex items-center gap-2 text-sm">
                            <span>{m.name}</span>
                            {isTef && (
                              <Badge variant="outline" className="text-[10px] border-border">
                                TEF
                              </Badge>
                            )}
                            {letter && (
                              <kbd className="ml-auto px-1.5 py-0.5 border border-border rounded text-[10px] bg-muted/40">
                                {letter}
                              </kbd>
                            )}
                          </span>
                          <Input
                            ref={(el) => (lineRefs.current[m.id] = el)}
                            value={lines[m.id]?.text || ''}
                            onChange={(e) => updateLine(m.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const cur = parseCurrencyInput(lines[m.id]?.text || '');
                                if (cur === 0 && remaining > 0) {
                                  fillRemainingOnLine(m.id);
                                  // apenas preenche; usuário avança manualmente (botão Próximo ou Ctrl+2)
                                }
                                // se já há valor digitado, Enter não faz nada — usuário decide avançar.
                              }
                            }}
                            placeholder="R$ 0,00"
                            inputMode="decimal"
                            disabled={processing}
                            className="w-40 text-right bg-muted/40 border-border focus:border-primary"
                          />
                        </li>
                      );
                    })}
                  </ul>

                  {showAdjust && (
                    <div className="rounded-md border border-border bg-muted/40 p-3 grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Desconto (R$)</Label>
                        <Input
                          ref={adjustRef}
                          value={discountText}
                          onChange={(e) => setDiscountText(maskCurrencyInput(e.target.value))}
                          inputMode="decimal"
                          disabled={processing}
                          className="bg-background border-border"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Acréscimo (R$)</Label>
                        <Input
                          value={surchargeText}
                          onChange={(e) => setSurchargeText(maskCurrencyInput(e.target.value))}
                          inputMode="decimal"
                          disabled={processing}
                          className="bg-background border-border"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 text-sm">
                    <span className="text-muted-foreground">
                      Pagamentos: <strong>{brl(allocated)}</strong>
                    </span>
                    <span
                      className={
                        exact
                          ? 'text-emerald-400 font-semibold'
                          : over
                            ? 'text-destructive font-semibold'
                            : 'text-destructive font-semibold border-b-2 border-destructive pb-0.5'
                      }
                    >
                      {over ? `Excede: ${brl(allocated - total)}` : `Falta: ${brl(remaining)}`}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAdjust((v) => !v);
                        setTimeout(() => adjustRef.current?.focus(), 50);
                      }}
                      disabled={processing}
                      className="border-border hover:bg-muted"
                    >
                      Desconto/Acréscimo (Home)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setStep(2)}
                      disabled={processing}
                      className="bg-muted hover:bg-muted/70"
                    >
                      Próximo
                    </Button>
                  </div>
                </div>
              )}

              {/* Etapa 2 */}
              <StepHeader
                num={2}
                label="Cliente"
                shortcut="Ctrl+2"
                optional
                active={step === 2}
                onClick={() => setStep(2)}
              />
              {step === 2 && (
                <div className="ml-9 space-y-3 max-w-xl">
                  {customerName || customerPhone || customerDocument ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {customerName || 'Cliente avulso'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[customerPhone, customerDocument && `CPF ${customerDocument}`]
                            .filter(Boolean)
                            .join(' • ') || 'Sem dados'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setCustomerDialogOpen(true)}
                          disabled={processing}
                        >
                          Alterar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCustomerName('');
                            setCustomerPhone('');
                            setCustomerDocument('');
                          }}
                          disabled={processing}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-3">
                      <p className="text-sm text-muted-foreground">Nenhum cliente vinculado</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCustomerDialogOpen(true)}
                        disabled={processing}
                      >
                        INFORMAR CLIENTE
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setStep(3)}
                      disabled={processing}
                      className="bg-muted hover:bg-muted/70"
                    >
                      Próximo
                    </Button>
                  </div>
                </div>
              )}

              {/* Etapa 3 */}
              <StepHeader
                num={3}
                label="Informações adicionais"
                shortcut="Ctrl+3"
                optional
                active={step === 3}
                onClick={() => setStep(3)}
              />
              {step === 3 && (
                <div className="ml-9 space-y-2 max-w-xl">
                  <Label className="text-xs text-muted-foreground">Observação</Label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Observação livre (opcional)"
                    disabled={processing}
                    className="w-full rounded-md bg-muted/40 border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => !processing && onOpenChange(false)}
                disabled={processing}
                className="text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              {defaultFiscalMode === 'ask' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSave('nao_fiscal')}
                    disabled={processing || !exact}
                    className="min-w-[180px]"
                  >
                    {processing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
                    ) : (
                      <><Save className="h-4 w-4 mr-1" /> Salvar pré-venda</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleSave('fiscal')}
                    disabled={processing || !exact}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[180px]"
                  >
                    {processing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
                    ) : (
                      <><Save className="h-4 w-4 mr-1" /> Salvar + NFC-e</>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={() => handleSave(defaultFiscalMode)}
                  disabled={processing || !exact}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[160px]"
                >
                  {processing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
                  ) : defaultFiscalMode === 'fiscal' ? (
                    <><Save className="h-4 w-4 mr-1" /> Salvar + NFC-e</>
                  ) : (
                    <><Save className="h-4 w-4 mr-1" /> Salvar pré-venda</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
      <FrenteCaixaCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        companyId={companyId}
        onPick={(c) => {
          setCustomerName(c.name || '');
          setCustomerPhone(c.phone || '');
          setCustomerDocument(c.document || '');
        }}
      />
    </Dialog>
  );
}

function SummaryRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className={emphasize ? 'text-foreground font-semibold' : 'text-muted-foreground text-sm'}>
        {label}:
      </span>
      <span
        className={
          emphasize
            ? 'text-emerald-400 font-bold text-lg tabular-nums'
            : 'text-foreground tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  );
}

function StepHeader({
  num,
  label,
  shortcut,
  optional,
  active,
  onClick,
}: {
  num: number;
  label: string;
  shortcut: string;
  optional?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 text-left w-full"
    >
      <span
        className={`h-7 w-7 rounded-full grid place-items-center text-xs font-semibold ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {num}
      </span>
      <span className={`text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <kbd className="px-1.5 py-0.5 border border-border rounded text-[10px] bg-muted/40">
        {shortcut}
      </kbd>
      {optional && (
        <span className="text-[11px] text-muted-foreground ml-1">Opcional</span>
      )}
    </button>
  );
}