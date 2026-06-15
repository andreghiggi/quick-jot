import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight } from 'lucide-react';
import {
  brl as formatPrice,
  maskCurrencyInput,
  parseCurrencyInput,
} from './_format';
import { printCashClosingDetailed } from '@/utils/cashClosingPrint';

export interface CloseCashSale {
  id: string;
  final_total: number;
  payment_method_id: string | null;
  payment_method_name: string;
  customer_name: string | null;
  created_at: string;
  origin: 'balcao' | 'cardapio_retirada' | 'cardapio_delivery' | 'mesa' | 'outros';
}

export interface CloseCashPaymentMethod {
  id: string;
  name: string;
}

interface CloseCashMovement {
  type: string;
  amount: number | string | null;
}

interface PDVV2CloseCashDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expectedAmount: number;
  openingAmount?: number;
  cashMovements?: CloseCashMovement[];
  sales: CloseCashSale[];
  paymentMethods?: CloseCashPaymentMethod[];
  /** Formas de pagamento do cardápio online (channel='menu'). Usadas no select de Deliveries quando informadas. */
  deliveryPaymentMethods?: CloseCashPaymentMethod[];
  onChangeSalePaymentMethod?: (saleId: string, paymentMethodId: string) => Promise<void> | void;
  onConfirm: (closingAmount: number, notes: string) => Promise<void>;
  /** Quando informado, habilita comportamentos isolados por empresa (ex.: máscara monetária). */
  companyId?: string;
  /** Nome da loja (usado no cabeçalho do relatório detalhado de fechamento). */
  companyName?: string;
  /** Tamanho do papel para impressão (apenas para o relatório detalhado). */
  paperSize?: '58mm' | '80mm';
}

const ORIGIN_LABEL: Record<CloseCashSale['origin'], string> = {
  balcao: 'Vendas Balcão',
  cardapio_retirada: 'Retiradas (cobradas no PDV)',
  cardapio_delivery: 'Deliveries',
  mesa: 'Mesas Importadas',
  outros: 'Outros',
};

export function PDVV2CloseCashDialog({
  open,
  onOpenChange,
  expectedAmount,
  openingAmount = 0,
  cashMovements = [],
  sales,
  paymentMethods = [],
  deliveryPaymentMethods,
  onChangeSalePaymentMethod,
  onConfirm,
  companyId,
  companyName,
  paperSize,
}: PDVV2CloseCashDialogProps) {
  const [closingAmount, setClosingAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reconcile, setReconcile] = useState<Record<string, string>>({});
  const [openOrigin, setOpenOrigin] = useState<CloseCashSale['origin'] | null>(null);
  // Rollout isolado: máscara de moeda em tempo real apenas para a Lancheria da I9.
  const useCurrencyMask = true;

  // Group: { [origin]: { [paymentName]: total } }
  const grouped = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const s of sales) {
      const o = s.origin || 'outros';
      const p = s.payment_method_name || 'Sem forma';
      if (!out[o]) out[o] = {};
      out[o][p] = (out[o][p] || 0) + s.final_total;
    }
    return out;
  }, [sales]);

  // Total declared per payment method (across all origins)
  const declaredByPayment = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sales) {
      const p = s.payment_method_name || 'Sem forma';
      out[p] = (out[p] || 0) + s.final_total;
    }
    return out;
  }, [sales]);

  /**
   * Conciliação consolidada: agrupa todas as variações de "máquina móvel"
   * (PIX/Débito/Crédito - máquina móvel) em uma única linha "Máquina móvel",
   * e todas as variações de TEF (Débito/Crédito à Vista/Parcelado) em
   * uma única linha "TEF". As demais formas permanecem como estão.
   * Afeta APENAS a seção "Conciliação por forma de pagamento" — o
   * "Resumo por origem" continua detalhado por forma.
   */
  function reconcileGroupOf(paymentName: string): string {
    const n = (paymentName || '').toLowerCase();
    if (/m[áa]quina\s*m[óo]vel/.test(n)) return 'Máquina móvel';
    if (/\btef\b/.test(n)) return 'TEF';
    return paymentName || 'Sem forma';
  }
  const declaredByReconcileGroup = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [pay, val] of Object.entries(declaredByPayment)) {
      const g = reconcileGroupOf(pay);
      out[g] = (out[g] || 0) + val;
    }
    return out;
  }, [declaredByPayment]);

  const cashBreakdown = useMemo(() => {
    const cashSales = sales
      .filter((s) => /dinheiro/i.test(s.payment_method_name || ''))
      .reduce((acc, s) => acc + (Number(s.final_total) || 0), 0);
    const suprimentos = cashMovements
      .filter((m) => m.type === 'suprimento')
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
    const sangrias = cashMovements
      .filter((m) => m.type === 'sangria')
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
    return { opening: Number(openingAmount || 0), cashSales, suprimentos, sangrias };
  }, [openingAmount, sales, cashMovements]);

  const salesByOrigin = useMemo(() => {
    const out: Record<string, CloseCashSale[]> = {};
    for (const s of sales) {
      const o = s.origin || 'outros';
      if (!out[o]) out[o] = [];
      out[o].push(s);
    }
    return out;
  }, [sales]);

  async function handleConfirm() {
    const v = useCurrencyMask
      ? parseCurrencyInput(closingAmount)
      : parseFloat(closingAmount.replace(',', '.')) || 0;
    setSubmitting(true);

    // Build reconciliation note
    const reconcileLines: string[] = [];
    for (const [pay, declared] of Object.entries(declaredByReconcileGroup)) {
      const informed = useCurrencyMask
        ? parseCurrencyInput(reconcile[pay] || '')
        : parseFloat((reconcile[pay] || '').replace(',', '.')) || 0;
      const diff = informed - declared;
      reconcileLines.push(
        `${pay}: declarado ${formatPrice(declared)} | informado ${formatPrice(informed)} | diferença ${formatPrice(diff)}`
      );
    }
    const fullNotes = [
      notes,
      reconcileLines.length ? '--- Conciliação ---' : '',
      ...reconcileLines,
    ]
      .filter(Boolean)
      .join('\n');

    await onConfirm(v, fullNotes);
    setSubmitting(false);
    setClosingAmount('');
    setNotes('');
    setReconcile({});
    onOpenChange(false);
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  const openOriginSales = openOrigin ? salesByOrigin[openOrigin] || [] : [];
  const isDeliveryOrigin = openOrigin === 'cardapio_delivery';

  // Disponível para qualquer loja com PDV V2 (este dialog só é montado no PDV V2).
  const showDetailedPrint = true;

  function printDetailedClosing() {
    const informedAmount = useCurrencyMask
      ? parseCurrencyInput(closingAmount)
      : parseFloat(closingAmount.replace(',', '.')) || 0;
    printCashClosingDetailed({
      companyName,
      paperSize,
      expectedAmount,
      sales,
      cashMovements: cashMovements.map((m) => ({
        type: m.type,
        amount: Number(m.amount || 0),
      })),
      physicalCash: closingAmount
        ? [{ species: 'DINHEIRO', systemAmount: expectedAmount, operatorAmount: informedAmount }]
        : undefined,
    });
  }

  const mainBody = (
    <div className="space-y-4 py-2">
      <div className="rounded-md border p-3 bg-muted/40">
        <p className="text-sm text-muted-foreground">Valor em dinheiro esperado em caixa</p>
        <p className="text-2xl font-bold tabular-nums">{formatPrice(expectedAmount)}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2"><span>Abertura</span><span>{formatPrice(cashBreakdown.opening)}</span></div>
          <div className="flex justify-between gap-2"><span>Dinheiro</span><span>{formatPrice(cashBreakdown.cashSales)}</span></div>
          <div className="flex justify-between gap-2"><span>Suprimento</span><span>{formatPrice(cashBreakdown.suprimentos)}</span></div>
          <div className="flex justify-between gap-2"><span>Sangria</span><span>-{formatPrice(cashBreakdown.sangrias)}</span></div>
        </div>
      </div>

      {/* Resumo por origem */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Resumo por origem</h3>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda no caixa.</p>
        ) : (
          Object.entries(grouped).map(([origin, methods]) => {
            const subtotal = Object.values(methods).reduce((s, v) => s + v, 0);
            return (
              <Card
                key={origin}
                className="cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                onClick={() => setOpenOrigin(origin as CloseCashSale['origin'])}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {ORIGIN_LABEL[origin as CloseCashSale['origin']] || origin}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="font-bold tabular-nums">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="text-xs space-y-1">
                    {Object.entries(methods).map(([pay, val]) => (
                      <div key={pay} className="flex justify-between">
                        <span className="text-muted-foreground">{pay}</span>
                        <span className="tabular-nums">{formatPrice(val)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Conciliação manual */}
      {Object.keys(declaredByReconcileGroup).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Conciliação por forma de pagamento</h3>
          <p className="text-xs text-muted-foreground">
            Informe o valor que você realmente recebeu em cada forma para validar divergências.
          </p>
          {Object.entries(declaredByReconcileGroup).map(([pay, declared]) => {
            const informed = useCurrencyMask
              ? parseCurrencyInput(reconcile[pay] || '')
              : parseFloat((reconcile[pay] || '').replace(',', '.')) || 0;
            const diff = informed - declared;
            const hasInput = (reconcile[pay] || '').length > 0;
            return (
              <div key={pay} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
                <div className="min-w-0">
                  <p className="text-sm truncate">{pay}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Declarado: {formatPrice(declared)}
                  </p>
                </div>
                <Input
                  type={useCurrencyMask ? 'text' : 'number'}
                  inputMode="decimal"
                  step={useCurrencyMask ? undefined : '0.01'}
                  placeholder={useCurrencyMask ? 'R$ 0,00' : 'Informado'}
                  className="w-32"
                  value={reconcile[pay] || ''}
                  onChange={(e) =>
                    setReconcile((s) => ({
                      ...s,
                      [pay]: useCurrencyMask
                        ? maskCurrencyInput(e.target.value)
                        : e.target.value,
                    }))
                  }
                />
                <span
                  className={`text-xs tabular-nums w-20 text-right ${
                    !hasInput
                      ? 'text-muted-foreground'
                      : diff === 0
                      ? 'text-green-600'
                      : diff > 0
                      ? 'text-blue-600'
                      : 'text-destructive'
                  }`}
                >
                  {hasInput ? (diff >= 0 ? `+${formatPrice(diff)}` : formatPrice(diff)) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Label>Valor real contado em caixa</Label>
        <Input
          type={useCurrencyMask ? 'text' : 'number'}
          inputMode="decimal"
          step={useCurrencyMask ? undefined : '0.01'}
          placeholder={useCurrencyMask ? 'R$ 0,00' : '0,00'}
          value={closingAmount}
          onChange={(e) =>
            setClosingAmount(
              useCurrencyMask ? maskCurrencyInput(e.target.value) : e.target.value,
            )
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Observações (opcional)</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas do fechamento..."
        />
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
          </DialogHeader>

          {useCurrencyMask ? (
            <div className="flex-1 min-h-0 overflow-y-auto pr-3">
              {mainBody}
            </div>
          ) : (
             <ScrollArea className="flex-1 min-h-0 pr-3">
              {mainBody}
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            {showDetailedPrint && (
              <Button variant="outline" onClick={printDetailedClosing} disabled={submitting}>
                Imprimir Detalhado
              </Button>
            )}
            <Button onClick={handleConfirm} disabled={submitting}>
              Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: listagem de vendas por origem */}
      <Dialog open={!!openOrigin} onOpenChange={(o) => !o && setOpenOrigin(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {openOrigin ? ORIGIN_LABEL[openOrigin] : ''} ({openOriginSales.length})
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-3">
            <div className="space-y-2 py-2 pb-4">
              {openOriginSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda nesta origem.</p>
              ) : (
                openOriginSales.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {s.customer_name || 'Sem cliente'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(s.created_at)}
                          </p>
                        </div>
                        <span className="font-bold tabular-nums">
                          {formatPrice(s.final_total)}
                        </span>
                      </div>

                      {isDeliveryOrigin && onChangeSalePaymentMethod ? (
                        (s.id.includes('__') || s.id.startsWith('order-')) ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Pagamento:</span>
                            <Badge variant="outline" className="text-xs">
                              {s.payment_method_name}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              (registro consolidado)
                            </span>
                          </div>
                        ) : (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground shrink-0">
                            Pagamento:
                          </Label>
                          <Select
                            value={s.payment_method_id || ''}
                            onValueChange={(v) => onChangeSalePaymentMethod(s.id, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecionar forma">
                                {s.payment_method_name}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(isDeliveryOrigin && deliveryPaymentMethods && deliveryPaymentMethods.length > 0
                                ? deliveryPaymentMethods
                                : paymentMethods
                              ).map((pm) => (
                                <SelectItem key={pm.id} value={pm.id}>
                                  {pm.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Pagamento:</span>
                          <Badge variant="outline" className="text-xs">
                            {s.payment_method_name}
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenOrigin(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
