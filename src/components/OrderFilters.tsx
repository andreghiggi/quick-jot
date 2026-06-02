import { useMemo } from 'react';
import { Order } from '@/types/order';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extractPaymentName } from '@/utils/orderNotesDisplay';

export type DeliveryFilter = 'all' | 'entrega' | 'retirada';
export type OriginFilter = 'all' | 'cardapio' | 'balcao' | 'mesa' | 'mesa_qr';
export type PaymentFilter = string; // 'all' | nome

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

      <Select value={payment} onValueChange={onPaymentChange}>
        <SelectTrigger className="h-9 w-auto min-w-[180px]">
          <SelectValue placeholder="Forma de pagamento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as formas</SelectItem>
          {paymentOptions.map((p) => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    if (payment !== 'all') {
      const isMulti = o.notes?.includes('[MULTI]');
      const name = extractPaymentName(o.notes);
      if (payment === 'Múltiplas formas') {
        if (!isMulti) return false;
      } else if (payment === 'Sem pagamento') {
        if (name) return false;
      } else {
        if (name !== payment) return false;
      }
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