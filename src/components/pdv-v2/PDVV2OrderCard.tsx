import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Order, OrderStatus } from '@/types/order';
import { formatPrice } from '@/lib/utils';
import { Clock, Store, ShoppingBag, Truck, ArrowRight, CreditCard } from 'lucide-react';

interface PDVV2OrderCardProps {
  order: Order & { origin?: 'cardapio' | 'balcao' | 'mesa' };
  onAdvance?: (order: Order) => void;
  onCharge?: (order: Order) => void;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
};

const STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'outline'> = {
  pending: 'outline',
  preparing: 'secondary',
  ready: 'default',
  delivered: 'outline',
};

const NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: null,
};

function originBadge(origin?: string) {
  switch (origin) {
    case 'balcao':
      return { label: 'Balcão', icon: Store, className: 'bg-blue-500/10 text-blue-700 border-blue-500/30' };
    case 'mesa':
      return { label: 'Mesa', icon: ShoppingBag, className: 'bg-purple-500/10 text-purple-700 border-purple-500/30' };
    default:
      return { label: 'Cardápio', icon: Truck, className: 'bg-orange-500/10 text-orange-700 border-orange-500/30' };
  }
}

export function PDVV2OrderCard({ order, onAdvance, onCharge }: PDVV2OrderCardProps) {
  const origin = originBadge((order as any).origin);
  const OriginIcon = origin.icon;
  const next = NEXT[order.status];

  // Extract payment method from notes
  const paymentMatch = order.notes?.match(/Pagamento:\s*(.+?)(\s*[\(|]|$)/i);
  const paymentName = paymentMatch?.[1]?.trim();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">#{order.dailyNumber}</span>
              <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
            </div>
            <p className="font-medium truncate">{order.customerName}</p>
          </div>
          <Badge variant="outline" className={origin.className}>
            <OriginIcon className="h-3 w-3 mr-1" />
            {origin.label}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          {order.items.slice(0, 3).map((it) => (
            <div key={it.id} className="flex justify-between gap-2">
              <span className="truncate">{it.quantity}× {it.name}</span>
              <span className="tabular-nums">{formatPrice(it.price * it.quantity)}</span>
            </div>
          ))}
          {order.items.length > 3 && (
            <p className="text-xs italic">+ {order.items.length - 3} itens</p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <span className="font-bold tabular-nums">{formatPrice(order.total)}</span>
        </div>

        {paymentName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CreditCard className="h-3 w-3" />
            <span className="truncate">{paymentName}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {next && onAdvance && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onAdvance(order)}>
              <ArrowRight className="h-3 w-3 mr-1" />
              {STATUS_LABEL[next]}
            </Button>
          )}
          {order.status === 'ready' && onCharge && (
            <Button size="sm" className="flex-1" onClick={() => onCharge(order)}>
              <CreditCard className="h-3 w-3 mr-1" />
              Cobrar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
