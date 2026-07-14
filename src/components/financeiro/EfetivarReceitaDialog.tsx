/**
 * Diálogo "Efetivar receita" — inspirado no checkout da Frente de Caixa.
 *
 * Lista as formas de pagamento com atalho por letra (A, B, C…), permitindo
 * split de pagamento direto (várias linhas somando o total). Contempla
 * juros/multa/desconto/acréscimo no cálculo do "Falta".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';
import type { AccountReceivable } from '@/hooks/useAccountsReceivable';
import { runMultiPayment, type MultiPaymentInputLine } from '@/utils/pdvV2MultiPayment';
import type { NFCeTefData } from '@/services/nfceService';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface EfetivarPayment {
  amount: number;
  paymentMethodId?: string | null;
  paymentName: string;
  /** Integração TEF quando aplicável — usada pelo Receitas para
   *  decidir se emite NFC-e financeira (5949/6949). */
  integration?: 'tef_pinpad' | 'tef_smartpos';
  /** Dados TEF aprovados (NSU/autorização/bandeira). Presente apenas
   *  para linhas TEF aprovadas via runMultiPayment. */
  tef?: NFCeTefData;
}

export interface EfetivarSubmit {
  interest: number;
  fine: number;
  discount: number;
  surcharge: number;
  payments: EfetivarPayment[];
  /** Operador optou por emitir NFC-e após o recebimento. Sempre `true`
   *  quando alguma linha usa forma de pagamento TEF (obrigatório por lei). */
  emitNfce: boolean;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function EfetivarReceitaDialog({
  open,
  onOpenChange,
  receivable,
  receivables,
  paymentMethods,
  companyId,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receivable: AccountReceivable | null;
  /** Quando informado, efetiva várias parcelas juntas (venda inteira). */
  receivables?: AccountReceivable[] | null;
  paymentMethods: Array<{ id: string; name: string; integrationType?: string | null }>;
  companyId?: string | null;
  onConfirm: (data: EfetivarSubmit) => Promise<void> | void;
  busy: boolean;
}) {
  const [interest, setInterest] = useState('0,00');
  const [fine, setFine] = useState('0,00');
  const [discount, setDiscount] = useState('0,00');
  const [surcharge, setSurcharge] = useState('0,00');
  const [lines, setLines] = useState<Record<string, string>>({});
  const [emitNfce, setEmitNfce] = useState(false);
  const [tefMod, setTefMod] = useState<
    Record<string, { modality: 'avista' | 'debit' | 'parcelado' | 'pix'; installments: number }>
  >({});
  const [processingTef, setProcessingTef] = useState(false);
  const [tefStatus, setTefStatus] = useState<string>('');
  const lineRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const list = useMemo(
    () => (receivables && receivables.length ? receivables : receivable ? [receivable] : []),
    [receivables, receivable],
  );
  const isMulti = list.length > 1;
  const balance = list.reduce((s, r) => s + Number(r.balance || 0), 0);
  const nInterest = parseCurrencyInput(interest);
  const nFine = parseCurrencyInput(fine);
  const nDiscount = parseCurrencyInput(discount);
  const nSurcharge = parseCurrencyInput(surcharge);
  const toEffective = useMemo(
    () => Math.max(0, +(balance + nInterest + nFine + nSurcharge - nDiscount).toFixed(2)),
    [balance, nInterest, nFine, nSurcharge, nDiscount],
  );
  const totalPaid = paymentMethods.reduce(
    (s, m) => s + parseCurrencyInput(lines[m.id] || ''),
    0,
  );
  const diff = +(toEffective - totalPaid).toFixed(2);
  const remaining = Math.max(0, diff);
  const over = diff < -0.005;
  const exact = Math.abs(diff) < 0.005 && totalPaid > 0;

  // Detecta se alguma linha usa forma de pagamento TEF com valor > 0.
  // Nesse caso, a emissão da NFC-e é obrigatória (não pode desmarcar).
  const hasTefLine = paymentMethods.some(
    (m) =>
      (m.integrationType || '').toLowerCase() === 'tef' &&
      parseCurrencyInput(lines[m.id] || '') > 0,
  );
  const effectiveEmitNfce = hasTefLine ? true : emitNfce;

  useEffect(() => {
    if (open) {
      setInterest('0,00');
      setFine('0,00');
      setDiscount('0,00');
      setSurcharge('0,00');
      setLines({});
      setEmitNfce(false);
      setTefMod({});
      setTefStatus('');
      setProcessingTef(false);
      setTimeout(() => {
        const first = paymentMethods[0];
        if (first) {
          const el = lineRefs.current[first.id];
          el?.focus();
          el?.select();
        }
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (id: string, text: string) =>
    setLines((prev) => ({ ...prev, [id]: maskCurrencyInput(text) }));

  const fillRemainingOnLine = (id: string) => {
    const cur = parseCurrencyInput(lines[id] || '');
    const target = cur + remaining;
    if (target <= 0) return;
    setLines((prev) => ({
      ...prev,
      [id]: maskCurrencyInput(target.toFixed(2).replace('.', ',')),
    }));
  };

  const focusMethodByIndex = (idx: number) => {
    const m = paymentMethods[idx];
    if (!m) return;
    // Ao trocar de forma de pagamento via atalho (A-Z), zera as demais
    // linhas para evitar que um valor residual (ex.: TEF selecionado antes)
    // continue sendo processado ao dar Enter na nova forma.
    setLines((prev) => {
      const next: Record<string, string> = {};
      for (const key of Object.keys(prev)) {
        if (key === m.id) next[key] = prev[key];
      }
      return next;
    });
    setTefMod((prev) => {
      const next: typeof prev = {};
      if (prev[m.id]) next[m.id] = prev[m.id];
      return next;
    });
    const el = lineRefs.current[m.id];
    el?.focus();
    el?.select();
  };

  const submit = async (emitNfceOverride?: boolean) => {
    if (!exact) return;
    const activeLines = paymentMethods
      .map((m) => {
        const amt = parseCurrencyInput(lines[m.id] || '');
        if (amt <= 0) return null;
        const integ = (m.integrationType || '').toLowerCase();
        const isTef = integ === 'tef_pinpad' || integ === 'tef_smartpos';
        return { method: m, amount: amt, isTef, integ };
      })
      .filter(Boolean) as Array<{
        method: (typeof paymentMethods)[number];
        amount: number;
        isTef: boolean;
        integ: string;
      }>;
    if (activeLines.length === 0) return;

    // Se houver linhas TEF, executa runMultiPayment (mesma engine do
    // Frente de Caixa / PDV V2) antes de registrar o recebimento. Em caso
    // de recusa, tudo é estornado automaticamente.
    const hasTef = activeLines.some((l) => l.isTef);
    // Guarda dados TEF resolvidos (NSU/aut/bandeira) por payment_method_id
    // para propagar ao onConfirm — Receitas usa para emitir a NFC-e
    // financeira 5949/6949.
    let resolvedTefByMethod: Record<string, NFCeTefData | undefined> = {};
    if (hasTef) {
      if (!companyId) {
        toast.error('Empresa não identificada para processar TEF.');
        return;
      }
      const mpLines: MultiPaymentInputLine[] = activeLines.map((l) => {
        const mod = tefMod[l.method.id] || { modality: 'avista' as const, installments: 2 };
        return {
          payment_method_id: l.method.id,
          payment_name: l.method.name,
          amount: l.amount,
          integration: l.isTef ? (l.integ as 'tef_pinpad' | 'tef_smartpos') : undefined,
          tef_options: l.isTef
            ? {
                modality: mod.modality,
                installments:
                  mod.modality === 'parcelado' ? Math.max(2, mod.installments || 2) : undefined,
              }
            : undefined,
        };
      });
      setProcessingTef(true);
      setTefStatus('Iniciando TEF…');
      const mp = await runMultiPayment({
        companyId,
        lines: mpLines,
        description: 'Recebimento de crediário',
        onStatus: setTefStatus,
      });
      setProcessingTef(false);
      setTefStatus('');
      if (!mp.ok) {
        const extra = mp.rolledBackCount
          ? ` (${mp.rolledBackCount} cobrança(s) estornada(s))`
          : '';
        toast.error((mp.errorMessage || 'Cobrança TEF recusada') + extra);
        return;
      }
      for (const l of mp.lines || []) {
        if (l.integration && l.tef) resolvedTefByMethod[l.payment_method_id] = l.tef;
      }
    }

    const payments: EfetivarPayment[] = activeLines.map((l) => ({
      amount: l.amount,
      paymentMethodId: l.method.id,
      paymentName: l.method.name,
      integration: l.isTef ? (l.integ as 'tef_pinpad' | 'tef_smartpos') : undefined,
      tef: l.isTef ? resolvedTefByMethod[l.method.id] : undefined,
    }));
    const emitFlag =
      typeof emitNfceOverride === 'boolean'
        ? hasTefLine || emitNfceOverride
        : effectiveEmitNfce;
    await onConfirm({
      interest: nInterest,
      fine: nFine,
      discount: nDiscount,
      surcharge: nSurcharge,
      payments,
      emitNfce: emitFlag,
    });
  };

  // Atalhos A..Z para focar formas de pagamento
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (busy) return;
      if (
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.length === 1 &&
        /[a-zA-Z]/.test(e.key)
      ) {
        const idx = LETTERS.indexOf(e.key.toUpperCase());
        if (idx >= 0 && idx < paymentMethods.length) {
          e.preventDefault();
          focusMethodByIndex(idx);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, paymentMethods]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Efetivar receita</DialogTitle>
        </DialogHeader>
        {list.length > 0 && (
          <div className="space-y-4">
            {/* Cabeçalho: Documento | A Efetivar | Juros | Multa | Desconto | Acréscimo */}
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-normal">Documento</th>
                    <th className="text-right px-3 py-2 font-normal">A Efetivar</th>
                    <th className="text-right px-3 py-2 font-normal">Juros</th>
                    <th className="text-right px-3 py-2 font-normal">Multa</th>
                    <th className="text-right px-3 py-2 font-normal">Desconto</th>
                    <th className="text-right px-3 py-2 font-normal">Acréscimo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-primary font-medium">
                      {isMulti
                        ? `Múltiplas parcelas (${list.length})`
                        : list[0].document_number || list[0].id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{brl(toEffective)}</td>
                    <td className="px-1 py-1">
                      <Input
                        value={interest}
                        onChange={(e) => setInterest(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={fine}
                        onChange={(e) => setFine(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={discount}
                        onChange={(e) => setDiscount(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={surcharge}
                        onChange={(e) => setSurcharge(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Formas de pagamento com atalhos por letra (estilo Frente de Caixa) */}
            <div>
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nenhuma forma de pagamento cadastrada.
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {paymentMethods.map((m, idx) => {
                    const letter = LETTERS[idx] || '';
                    const integ = (m.integrationType || '').toLowerCase();
                    const isTef = integ === 'tef_pinpad' || integ === 'tef_smartpos';
                    const lineAmount = parseCurrencyInput(lines[m.id] || '');
                    const mod = tefMod[m.id] || { modality: 'avista' as const, installments: 2 };
                    return (
                      <li key={m.id} className="py-2.5 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="flex-1 flex items-center gap-2 text-sm">
                            <span>{m.name}</span>
                            {isTef && (
                              <span className="text-[10px] px-1.5 py-0.5 border border-border rounded bg-muted/40">
                                TEF
                              </span>
                            )}
                            {letter && (
                              <kbd className="ml-auto px-1.5 py-0.5 border border-border rounded text-[10px] bg-muted/40">
                                {letter}
                              </kbd>
                            )}
                          </span>
                          <Input
                            ref={(el) => (lineRefs.current[m.id] = el)}
                            value={lines[m.id] || ''}
                            onChange={(e) => updateLine(m.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const cur = parseCurrencyInput(lines[m.id] || '');
                                if (cur === 0 && remaining > 0) {
                                  fillRemainingOnLine(m.id);
                                  return;
                                }
                                if (exact && !busy && !processingTef) submit();
                              }
                            }}
                            placeholder="R$ 0,00"
                            inputMode="decimal"
                            disabled={busy || processingTef}
                            className="w-40 text-right"
                          />
                        </div>
                        {isTef && lineAmount > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs pl-1">
                            <span className="text-muted-foreground">Modalidade:</span>
                            {([
                              { id: 'avista', label: 'Crédito à vista' },
                              { id: 'debit', label: 'Débito' },
                              { id: 'parcelado', label: 'Parcelado' },
                              { id: 'pix', label: 'PIX' },
                            ] as const).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={busy || processingTef}
                                onClick={() =>
                                  setTefMod((prev) => ({
                                    ...prev,
                                    [m.id]: {
                                      modality: opt.id,
                                      installments: prev[m.id]?.installments || 2,
                                    },
                                  }))
                                }
                                className={`px-2 py-1 rounded border text-xs transition-colors ${
                                  mod.modality === opt.id
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-muted/40 hover:bg-muted'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                            {mod.modality === 'parcelado' && (
                              <span className="flex items-center gap-1">
                                <span className="text-muted-foreground">Parcelas:</span>
                                <Input
                                  type="number"
                                  min={2}
                                  max={18}
                                  value={mod.installments || 2}
                                  onChange={(e) =>
                                    setTefMod((prev) => ({
                                      ...prev,
                                      [m.id]: {
                                        modality: 'parcelado',
                                        installments: Math.max(
                                          2,
                                          Math.min(18, Number(e.target.value) || 2),
                                        ),
                                      },
                                    }))
                                  }
                                  disabled={busy || processingTef}
                                  className="w-16 h-7 text-right"
                                />
                                <span className="text-muted-foreground">x</span>
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {(processingTef || tefStatus) && (
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex items-center gap-2">
                  {processingTef && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{tefStatus || 'Processando TEF…'}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 text-sm">
                <span className="text-muted-foreground">
                  Pagamentos: <strong>{brl(totalPaid)}</strong>
                </span>
                <span
                  className={
                    exact
                      ? 'text-emerald-500 font-semibold'
                      : 'text-destructive font-semibold'
                  }
                >
                  {over
                    ? `Excede: ${brl(totalPaid - toEffective)}`
                    : `Falta: ${brl(remaining)}`}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground pt-3 border-t mt-3">
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">A–Z</kbd>{' '}
                foca a forma de pagamento.{' '}
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">Enter</kbd>{' '}
                preenche o restante e efetiva.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy || processingTef}
          >
            CANCELAR
          </Button>
          {!hasTefLine && (
            <Button
              variant="outline"
              onClick={() => submit(false)}
              disabled={busy || processingTef || !exact}
            >
              EFETIVAR
            </Button>
          )}
          <Button
            onClick={() => submit(true)}
            disabled={busy || processingTef || !exact}
          >
            {processingTef ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
            ) : (
              'EFETIVAR COM NFC-E'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}