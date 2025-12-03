import { Order, OrderStatus } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, MapPin, ChevronRight, Trash2 } from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { cn } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
}

const statusConfig: Record<OrderStatus, { label: string; className: string; next?: OrderStatus }> = {
  pending: { 
    label: 'Pendente', 
    className: 'bg-warning/20 text-warning-foreground border-warning/30',
    next: 'preparing'
  },
  preparing: { 
    label: 'Preparando', 
    className: 'bg-primary/20 text-primary border-primary/30',
    next: 'ready'
  },
  ready: { 
    label: 'Pronto', 
    className: 'bg-success/20 text-success border-success/30',
    next: 'delivered'
  },
  delivered: { 
    label: 'Entregue', 
    className: 'bg-muted text-muted-foreground border-muted',
  },
};

const nextStatusLabel: Record<OrderStatus, string> = {
  pending: 'Preparar',
  preparing: 'Pronto',
  ready: 'Entregar',
  delivered: '',
};

export function OrderCard({ order }: OrderCardProps) {
  const { updateOrderStatus, deleteOrder } = useOrderStore();
  const config = statusConfig[order.status];
  const createdAt = new Date(order.createdAt);
  const timeAgo = formatTimeAgo(createdAt);

  function handleAdvanceStatus() {
    if (config.next) {
      updateOrderStatus(order.id, config.next);
    }
  }

  return (
    <div className={cn(
      "bg-card rounded-xl p-4 shadow-card border border-border animate-slide-up",
      "hover:shadow-lg transition-shadow duration-200"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground">#{order.id.slice(-4)}</span>
            <Badge variant="outline" className={cn("text-xs", config.className)}>
              {config.label}
            </Badge>
          </div>
          <h3 className="font-semibold text-foreground">{order.customerName}</h3>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs">{timeAgo}</span>
        </div>
      </div>

      {order.customerPhone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Phone className="w-3.5 h-3.5" />
          <span>{order.customerPhone}</span>
        </div>
      )}

      {order.deliveryAddress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <MapPin className="w-3.5 h-3.5" />
          <span className="line-clamp-1">{order.deliveryAddress}</span>
        </div>
      )}

      <div className="border-t border-border pt-3 mb-3">
        <div className="space-y-1.5">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-foreground">
                {item.quantity}x {item.name}
              </span>
              <span className="text-muted-foreground">
                R$ {(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div>
          <span className="text-sm text-muted-foreground">Total</span>
          <p className="text-lg font-bold text-foreground">
            R$ {order.total.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => deleteOrder(order.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {config.next && (
            <Button 
              size="sm" 
              onClick={handleAdvanceStatus}
              className="gap-1"
            >
              {nextStatusLabel[order.status]}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}min`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  return date.toLocaleDateString('pt-BR');
}
