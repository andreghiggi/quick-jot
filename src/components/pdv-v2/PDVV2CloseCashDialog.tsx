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
  LANCHERIA_I9_COMPANY_ID,
} from './_format';

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

interface PDVV2CloseCashDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expectedAmount: number;
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
    for (const [pay, declared] of Object.entries(declaredByPayment)) {
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

  // Rollout isolado: relatório detalhado de fechamento apenas para a Lancheria da I9.
  const showDetailedPrint = companyId === LANCHERIA_I9_COMPANY_ID;

  function printDetailedClosing() {
    const w = window.open('', '_blank');
    if (!w) return;
    const size = paperSize || '80mm';
    const now = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    // Quebra: { [origin]: { [paymentName]: { total, count } } }
    const detailed: Record<string, Record<string, { total: number; count: number }>> = {};
    for (const s of sales) {
      const o = s.origin || 'outros';
      const p = s.payment_method_name || 'Sem forma';
      if (!detailed[o]) detailed[o] = {};
      if (!detailed[o][p]) detailed[o][p] = { total: 0, count: 0 };
      detailed[o][p].total += s.final_total;
      detailed[o][p].count += 1;
    }

    // Totais por forma (todas origens)
    const byPayment: Record<string, { total: number; count: number }> = {};
    for (const s of sales) {
      const p = s.payment_method_name || 'Sem forma';
      if (!byPayment[p]) byPayment[p] = { total: 0, count: 0 };
      byPayment[p].total += s.final_total;
      byPayment[p].count += 1;
    }

    const totalGeral = sales.reduce((acc, s) => acc + s.final_total, 0);
    const totalVendas = sales.length;

    const originSections = Object.entries(detailed).map(([origin, methods]) => {
      const subtotal = Object.values(methods).reduce((s, v) => s + v.total, 0);
      const subcount = Object.values(methods).reduce((s, v) => s + v.count, 0);
      const rows = Object.entries(methods)
        .map(([pay, v]) => `
          <div class="row">
            <span>${pay} <small>(${v.count})</small></span>
            <span>R$ ${v.total.toFixed(2).replace('.', ',')}</span>
          </div>`).join('');
      return `
        <div class="section">
          <div class="row bold">
            <span>${ORIGIN_LABEL[origin as CloseCashSale['origin']] || origin} (${subcount})</span>
            <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
          </div>
          ${rows}
        </div>
        <div class="divider"></div>`;
    }).join('');

    const paymentRows = Object.entries(byPayment)
      .map(([pay, v]) => `
        <div class="row">
          <span>${pay} <small>(${v.count})</small></span>
          <span>R$ ${v.total.toFixed(2).replace('.', ',')}</span>
        </div>`).join('');

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Fechamento Detalhado</title>
      <style>
        @page { margin: 0; size: ${size} auto; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: ${size}; padding: 3mm; }
        .header { text-align: center; margin-bottom: 2mm; }
        .header h1 { font-size: 14px; font-weight: bold; }
        .header h2 { font-size: 13px; font-weight: bold; margin: 2mm 0; }
        .header p { font-size: 10px; }
        .divider { border-top: 1px dashed #000; margin: 2mm 0; }
        .section { margin: 2mm 0; }
        .row { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 11px; gap: 4mm; }
        .row.bold { font-weight: bold; font-size: 12px; }
        .row.total { font-size: 13px; font-weight: bold; margin: 2mm 0; }
        .group-title { font-weight: bold; font-size: 12px; margin: 2mm 0 1mm; text-transform: uppercase; }
        .footer { text-align: center; font-size: 9px; margin-top: 3mm; color: #666; }
        small { font-weight: normal; color: #444; }
      </style></head>
      <body>
        <div class="header">
          <h1>${companyName || 'LOJA'}</h1>
          <h2>FECHAMENTO DE CAIXA</h2>
          <h2 style="font-size:11px">RELATÓRIO DETALHADO</h2>
          <p>${now}</p>
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row bold"><span>Valor esperado em caixa:</span><span>R$ ${expectedAmount.toFixed(2).replace('.', ',')}</span></div>
          <div class="row"><span>Total de vendas:</span><span>${totalVendas}</span></div>
          <div class="row bold"><span>Total geral:</span><span>R$ ${totalGeral.toFixed(2).replace('.', ',')}</span></div>
        </div>
        <div class="divider"></div>
        <div class="group-title">Por origem × forma</div>
        ${originSections}
        <div class="group-title">Totais por forma de pagamento</div>
        <div class="section">${paymentRows}</div>
        <div class="divider"></div>
        <p class="footer">Impresso em ${now}</p>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>`;

    w.document.write(html);
    w.document.close();
  }

  const mainBody = (
    <div className="space-y-4 py-2">
      <div className="rounded-md border p-3 bg-muted/40">
        <p className="text-sm text-muted-foreground">Valor esperado em caixa</p>
        <p className="text-2xl font-bold tabular-nums">{formatPrice(expectedAmount)}</p>
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
      {Object.keys(declaredByPayment).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Conciliação por forma de pagamento</h3>
          <p className="text-xs text-muted-foreground">
            Informe o valor que você realmente recebeu em cada forma para validar divergências.
          </p>
          {Object.entries(declaredByPayment).map(([pay, declared]) => {
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
