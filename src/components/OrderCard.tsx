import { Order, OrderStatus } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, MapPin, ChevronRight, Trash2, Printer, CheckCircle2 } from 'lucide-react';
import { useOrderContext } from '@/contexts/OrderContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OrderCardProps {
  order: Order;
}

const statusConfig: Record<OrderStatus, { label: string; bgColor: string; textColor: string; borderColor: string; next?: OrderStatus }> = {
  pending: { 
    label: 'Pendente', 
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-800 dark:text-amber-200',
    borderColor: 'border-amber-300 dark:border-amber-700',
    next: 'preparing'
  },
  preparing: { 
    label: 'Preparando', 
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-800 dark:text-blue-200',
    borderColor: 'border-blue-300 dark:border-blue-700',
    next: 'ready'
  },
  ready: { 
    label: 'Pronto', 
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-800 dark:text-green-200',
    borderColor: 'border-green-300 dark:border-green-700',
    next: 'delivered'
  },
  delivered: { 
    label: 'Entregue', 
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-600 dark:text-gray-400',
    borderColor: 'border-gray-300 dark:border-gray-600',
  },
};

const nextStatusLabel: Record<OrderStatus, string> = {
  pending: 'Preparar',
  preparing: 'Pronto',
  ready: 'Entregar',
  delivered: '',
};

export function OrderCard({ order }: OrderCardProps) {
  const { updateOrderStatus, deleteOrder } = useOrderContext();
  const config = statusConfig[order.status];
  const createdAt = new Date(order.createdAt);
  const timeAgo = formatTimeAgo(createdAt);

  async function handleAdvanceStatus() {
    if (config.next) {
      await updateOrderStatus(order.id, config.next);
    }
  }

  async function handleDelete() {
    await deleteOrder(order.id);
  }

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pedido #${order.dailyNumber}</title>
        <style>
          body { font-family: 'Courier New', monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 5px; }
          h2 { text-align: center; font-size: 24px; margin: 10px 0; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .item { display: flex; justify-content: space-between; margin: 5px 0; }
          .total { font-weight: bold; font-size: 16px; margin-top: 10px; }
          .info { font-size: 12px; margin: 5px 0; }
          .center { text-align: center; }
        </style>
      </head>
      <body>
        <h1>COMANDA TECH</h1>
        <h2>PEDIDO #${order.dailyNumber}</h2>
        <p class="center info">${createdAt.toLocaleString('pt-BR')}</p>
        <div class="divider"></div>
        <p><strong>Cliente:</strong> ${order.customerName}</p>
        ${order.customerPhone ? `<p class="info"><strong>Tel:</strong> ${order.customerPhone}</p>` : ''}
        ${order.deliveryAddress ? `<p class="info"><strong>End:</strong> ${order.deliveryAddress}</p>` : ''}
        <div class="divider"></div>
        <p><strong>ITENS:</strong></p>
        ${order.items.map(item => `
          <div class="item">
            <span>${item.quantity}x ${item.name}</span>
            <span>R$ ${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="divider"></div>
        <div class="item total">
          <span>TOTAL:</span>
          <span>R$ ${order.total.toFixed(2)}</span>
        </div>
        ${order.notes ? `<div class="divider"></div><p class="info"><strong>Obs:</strong> ${order.notes}</p>` : ''}
        <div class="divider"></div>
        <p class="center info">Obrigado pela preferência!</p>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  return (
    <div className={cn(
      "bg-card rounded-xl p-4 shadow-card border-2 animate-slide-up",
      "hover:shadow-lg transition-shadow duration-200",
      config.borderColor
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-primary">#{order.dailyNumber}</span>
            <Badge className={cn("text-xs border", config.bgColor, config.textColor, config.borderColor)}>
              {config.label}
            </Badge>
            {order.printed && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Impresso automaticamente</p>
                    {order.printedAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.printedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
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
            className="text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={handlePrint}
            title="Imprimir pedido"
          >
            <Printer className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
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
