import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Order, OrderStatus } from '@/types/order';
import { brl as formatPrice } from './_format';
import {
  Clock,
  Store,
  ShoppingBag,
  Truck,
  ArrowRight,
  CreditCard,
  Pencil,
  Bike,
  PackageCheck,
  Globe,
} from 'lucide-react';

interface PDVV2OrderCardProps {
  order: Order;
  onAdvance?: (order: Order) => void;
  onCharge?: (order: Order) => void;
  onChangePayment?: (order: Order, methodName: string) => void;
  paymentOptions?: { id: string; name: string }[];
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

function originBadge(origin?: string) {
  switch (origin) {
    case 'balcao':
      return {
        label: 'Balcão',
        icon: Store,
        className: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
      };
    case 'mesa':
      return {
        label: 'Mesa',
        icon: ShoppingBag,
        className: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
      };
    default:
      return {
        label: 'Cardápio',
        icon: Globe,
        className: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
      };
  }
}

function isDelivery(order: Order) {
  return !!order.deliveryAddress && order.deliveryAddress.trim().length > 0;
}

export function PDVV2OrderCard({
  order,
  onAdvance,
  onCharge,
  onChangePayment,
  paymentOptions = [],
}: PDVV2OrderCardProps) {
  const origin = originBadge(order.origin);
  const OriginIcon = origin.icon;

  const delivery = isDelivery(order);
  const isCardapio = (order.origin || 'cardapio') === 'cardapio';

  // Extract payment method from notes
  const paymentMatch = order.notes?.match(/Pagamento:\s*(.+?)(\s*[\(|]|$)/i);
  const paymentName = paymentMatch?.[1]?.trim();

  // Define the next button label based on flow
  // - Delivery (cardápio): pending → preparing → ready → "Saiu para entrega" → "Entregue"
  // - Retirada/Balcão/Mesa: pending → preparing → ready (then "Cobrar")
  let advanceLabel: string | null = null;
  let advanceTarget: OrderStatus | null = null;

  if (order.status === 'pending') {
    advanceLabel = 'Preparando';
    advanceTarget = 'preparing';
  } else if (order.status === 'preparing') {
    advanceLabel = 'Pronto';
    advanceTarget = 'ready';
  } else if (order.status === 'ready') {
    if (delivery && isCardapio) {
      advanceLabel = 'Saiu para entrega';
      advanceTarget = 'delivered';
    }
    // Retirada / balcão / mesa: sem botão "avançar" — usa "Cobrar"
  }

  // Show "Cobrar" button when:
  // - status === 'ready' AND (balcao OR (cardapio AND retirada) OR mesa)
  // - i.e. NOT delivery
  const showCharge =
    order.status === 'ready' && !delivery && !!onCharge;

  // For delivery: when delivered already, show nothing; when ready, show "Saiu p/ entrega" via advance.
  // After "saiu" (status delivered), no further action.

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg">#{order.dailyNumber}</span>
              <Badge variant={STATUS_VARIANT[order.status]}>
                {STATUS_LABEL[order.status]}
              </Badge>
              {/* Tipo de entrega visual extra (apenas cardapio) */}
              {isCardapio && (
                <Badge
                  variant="outline"
                  className={
                    delivery
                      ? 'bg-rose-500/10 text-rose-700 border-rose-500/30'
                      : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                  }
                >
                  {delivery ? (
                    <>
                      <Bike className="h-3 w-3 mr-1" />
                      Entrega
                    </>
                  ) : (
                    <>
                      <PackageCheck className="h-3 w-3 mr-1" />
                      Retirada
                    </>
                  )}
                </Badge>
              )}
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
              <span className="truncate">
                {it.quantity}× {it.name}
              </span>
              <span className="tabular-nums">
                {formatPrice(it.price * it.quantity)}
              </span>
            </div>
          ))}
          {order.items.length > 3 && (
            <p className="text-xs italic">+ {order.items.length - 3} itens</p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <span className="font-bold tabular-nums">{formatPrice(order.total)}</span>
        </div>

        {/* Forma de pagamento — editável APENAS em delivery do cardápio */}
        {paymentName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CreditCard className="h-3 w-3 shrink-0" />
            <span className="truncate flex-1">{paymentName}</span>
            {delivery && isCardapio && onChangePayment && paymentOptions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Editar forma de pagamento"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Alterar para</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {paymentOptions.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => onChangePayment(order, p.name)}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {advanceLabel && advanceTarget && onAdvance && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onAdvance(order)}
            >
              {advanceTarget === 'delivered' && delivery ? (
                <Bike className="h-3 w-3 mr-1" />
              ) : (
                <ArrowRight className="h-3 w-3 mr-1" />
              )}
              {advanceLabel}
            </Button>
          )}
          {showCharge && (
            <Button size="sm" className="flex-1" onClick={() => onCharge!(order)}>
              <CreditCard className="h-3 w-3 mr-1" />
              Cobrar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
