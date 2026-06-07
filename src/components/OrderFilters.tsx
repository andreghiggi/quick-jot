import { useMemo } from 'react';
import { Order } from '@/types/order';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown } from 'lucide-react';
import { extractPaymentName } from '@/utils/orderNotesDisplay';

export type DeliveryFilter = 'all' | 'entrega' | 'retirada';
export type OriginFilter = 'all' | 'cardapio' | 'balcao' | 'mesa' | 'mesa_qr';
export type PaymentFilter = string[]; // [] = todas; lista de nomes selecionados

interface OrderFiltersProps {
  orders: Order[];
  delivery: DeliveryFilter;
  origin: OriginFilter;
  payment: PaymentFilter;
  onDeliveryChange: (v: DeliveryFilter) => void;
  onOriginChange: (v: OriginFilter) => void;
  onPaymentChange: (v: PaymentFilter) => void;
}

export function OrderFilters({
  orders,
  delivery,
  origin,
  payment,
  onDeliveryChange,
  onOriginChange,
  onPaymentChange,
}: OrderFiltersProps) {
  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    let hasMulti = false;
    let hasSemPag = false;
    for (const o of orders) {
      if (o.notes?.includes('[MULTI]')) hasMulti = true;
      const name = extractPaymentName(o.notes);
      if (name) set.add(name);
      else hasSemPag = true;
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (hasMulti) list.push('Múltiplas formas');
    if (hasSemPag) list.push('Sem pagamento');
    return list;
  }, [orders]);

  const togglePayment = (name: string) => {
    if (payment.includes(name)) {
      onPaymentChange(payment.filter((p) => p !== name));
    } else {
      onPaymentChange([...payment, name]);
    }
  };

  const paymentLabel =
    payment.length === 0
      ? 'Todas as formas'
      : payment.length === 1
        ? payment[0]
        : `${payment.length} formas`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={delivery} onValueChange={(v) => onDeliveryChange(v as DeliveryFilter)}>
        <SelectTrigger className="h-9 w-auto min-w-[160px]">
          <SelectValue placeholder="Forma de entrega" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as entregas</SelectItem>
          <SelectItem value="entrega">🛵 Entrega</SelectItem>
          <SelectItem value="retirada">🏪 Retirada</SelectItem>
        </SelectContent>
      </Select>

      <Select value={origin} onValueChange={(v) => onOriginChange(v as OriginFilter)}>
        <SelectTrigger className="h-9 w-auto min-w-[160px]">
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as origens</SelectItem>
          <SelectItem value="cardapio">Cardápio Online</SelectItem>
          <SelectItem value="balcao">Balcão / Express</SelectItem>
          <SelectItem value="mesa">Mesa</SelectItem>
          <SelectItem value="mesa_qr">Mesa via QR</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 min-w-[180px] justify-between font-normal"
          >
            <span className="truncate">{paymentLabel}</span>
            <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="flex items-center justify-between px-2 py-1.5 border-b mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              Formas de pagamento
            </span>
            {payment.length > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => onPaymentChange([])}
              >
                Limpar
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {paymentOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">
                Nenhuma forma disponível
              </p>
            ) : (
              paymentOptions.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={payment.includes(p)}
                    onCheckedChange={() => togglePayment(p)}
                  />
                  <span className="text-sm">{p}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function filterOrders(
  orders: Order[],
  delivery: DeliveryFilter,
  origin: OriginFilter,
  payment: PaymentFilter,
): Order[] {
  return orders.filter((o) => {
    // Delivery
    if (delivery !== 'all') {
      const isEntrega = !!o.deliveryAddress;
      if (delivery === 'entrega' && !isEntrega) return false;
      if (delivery === 'retirada' && isEntrega) return false;
    }
    // Origin
    if (origin !== 'all') {
      const isMesaQr = o.notes?.includes('[MESA_QR]') || o.notes?.includes('Mesa via QR');
      if (origin === 'mesa_qr') {
        if (!isMesaQr) return false;
      } else {
        if (isMesaQr) return false;
        if ((o.origin || 'cardapio') !== origin) return false;
      }
    }
    // Payment
    if (payment.length > 0) {
      const isMulti = o.notes?.includes('[MULTI]');
      const name = extractPaymentName(o.notes);
      const matches = payment.some((sel) => {
        if (sel === 'Múltiplas formas') return !!isMulti;
        if (sel === 'Sem pagamento') return !name;
        return name === sel;
      });
      if (!matches) return false;
    }
    return true;
  });
}

export function summarizeOrders(orders: Order[]) {
  const nonCancelled = orders.filter((o) => !o.notes?.includes('[CANCELADA]'));
  const total = nonCancelled.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const count = nonCancelled.length;
  const avg = count > 0 ? total / count : 0;
  return { count, total, avg, cancelled: orders.length - count };
}