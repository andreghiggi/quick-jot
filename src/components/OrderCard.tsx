import { useState, useEffect, useMemo } from 'react';
import { Order, OrderStatus } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, MapPin, ChevronRight, Trash2, Printer, CheckCircle2, Check, Loader2 } from 'lucide-react';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface OrderCardProps {
  order: Order;
  paperSize?: '58mm' | '80mm';
  storeName?: string;
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

export function OrderCard({ order, paperSize = '58mm', storeName = 'Comanda Tech' }: OrderCardProps) {
  const { updateOrderStatus, deleteOrder, sendConfirmationWhatsApp } = useOrderContext();
  const { company } = useAuthContext();
  const isLancheriaI9 = company?.name?.toLowerCase().includes('lancheria da i9');
  const config = statusConfig[order.status];
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  // Catalog lookup for Lancheria da I9 to enrich legacy order items with prices
  const [optionalsCatalog, setOptionalsCatalog] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    if (!isLancheriaI9 || !company?.id) return;
    supabase
      .from('product_optionals')
      .select('name, price, product_id, products!inner(name, company_id)')
      .eq('products.company_id', company.id)
      .eq('active', true)
      .then(({ data }) => {
        if (!data) return;
        // Build map: productName -> { optionalName -> price }
        const catalog: Record<string, Record<string, number>> = {};
        data.forEach((row: any) => {
          const productName = row.products?.name;
          if (!productName) return;
          if (!catalog[productName]) catalog[productName] = {};
          catalog[productName][row.name] = Number(row.price);
        });
        setOptionalsCatalog(catalog);
      });
  }, [isLancheriaI9, company?.id]);
  // Converter para fuso horário de São Paulo
  const createdAt = new Date(order.createdAt);
  const timeAgo = formatTimeAgo(createdAt);
  
  // Formatar hora no fuso de SP para exibição
  const formattedTime = createdAt.toLocaleTimeString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', 
    minute: '2-digit' 
  });

  async function handleConfirmOrder() {
    setConfirming(true);
    const success = await sendConfirmationWhatsApp(order.id);
    setConfirming(false);
    if (success) setConfirmed(true);
  }

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

    // Formatar data/hora no fuso horário de São Paulo
    const formattedDate = createdAt.toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calculate subtotal and delivery fee
    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = order.total - subtotal > 0 ? order.total - subtotal : 0;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Pedido #${order.orderCode || order.dailyNumber}</title>
        <style>
          @page { margin: 0; size: ${paperSize} auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', 'Lucida Console', monospace; 
            font-size: ${paperSize === '80mm' ? '11pt' : '10pt'};
            font-weight: bold;
            width: ${paperSize};
            max-width: ${paperSize};
            padding: 2mm;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
          }
          .center { text-align: center; }
          .header { text-align: center; margin-bottom: 2mm; }
          .store-name { font-size: 12pt; font-weight: bold; }
          .order-num { font-size: 16pt; font-weight: bold; margin: 1mm 0; }
          .date { font-size: 8pt; }
          .divider { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
          .label { font-size: 9pt; font-weight: bold; }
          .value { font-size: 10pt; font-weight: bold; }
          .section { margin: 1mm 0; }
          .section p { margin: 0.5mm 0; font-size: 10pt; }
          .item { margin: 1.5mm 0; }
          .item-name { font-size: 11pt; font-weight: bold; text-transform: uppercase; }
          .item-detail { font-size: 9pt; margin-left: 2mm; }
          .item-notes { font-size: 9pt; font-style: italic; margin-left: 2mm; }
          .total-line { display: flex; justify-content: space-between; font-size: 10pt; margin: 0.5mm 0; }
          .grand-total { display: flex; justify-content: space-between; font-size: 13pt; font-weight: bold; margin: 1mm 0; }
          .notes { font-size: 9pt; margin: 1mm 0; }
          .footer { text-align: center; font-size: 8pt; margin-top: 2mm; }
          .delivery-badge { 
            text-align: center; 
            font-size: 11pt; 
            font-weight: bold; 
            padding: 1mm; 
            margin: 1mm 0;
            border: 1px solid #000;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="store-name">${storeName.toUpperCase()}</div>
          <div class="order-num">PEDIDO #${order.orderCode || order.dailyNumber}</div>
          <div class="date">${formattedDate}</div>
        </div>
        <hr class="divider">
        <div class="section">
          <p><span class="label">CLIENTE:</span> ${order.customerName}</p>
          ${order.customerPhone ? `<p><span class="label">TEL:</span> ${order.customerPhone}</p>` : ''}
          ${(() => {
            // Extract CPF, city, state from notes if present
            const notes = order.notes || '';
            const cpfMatch = notes.match(/CPF:\s*([^\n|]+)/i);
            const cidadeMatch = notes.match(/Cidade:\s*([^\n|]+)/i);
            const estadoMatch = notes.match(/Estado:\s*([^\n|]+)/i);
            let extraInfo = '';
            if (cpfMatch) extraInfo += `<p><span class="label">CPF:</span> ${cpfMatch[1].trim()}</p>`;
            if (cidadeMatch || estadoMatch) {
              const city = cidadeMatch ? cidadeMatch[1].trim() : '';
              const state = estadoMatch ? estadoMatch[1].trim() : '';
              extraInfo += `<p><span class="label">LOCAL:</span> ${[city, state].filter(Boolean).join(' - ')}</p>`;
            }
            // Extract payment method and change info
            const pagamentoMatch = notes.match(/Pagamento:\s*([^(|]+)/i);
            const trocoMatch = notes.match(/Troco para R\$\s*([^\)]+)/i);
            const pixKeyMatch = notes.match(/Chave PIX:\s*([^)]+)\)/i);
            if (pagamentoMatch) extraInfo += `<p><span class="label">PAGAMENTO:</span> ${pagamentoMatch[1].trim()}</p>`;
            if (trocoMatch) extraInfo += `<p><span class="label">TROCO PARA:</span> R$ ${trocoMatch[1].trim()}</p>`;
            if (pixKeyMatch) extraInfo += `<p><span class="label">CHAVE PIX:</span> ${pixKeyMatch[1].trim()}</p>`;
            return extraInfo;
          })()}
        </div>
        ${order.deliveryAddress 
          ? `<div class="delivery-badge">🛵 ENTREGA</div>
             <div class="section"><p><span class="label">END:</span> ${order.deliveryAddress}</p></div>` 
          : `<div class="delivery-badge">🏪 RETIRADA NO LOCAL</div>`}
        <hr class="divider">
        <div class="section">
          ${order.items.map(item => {
            const itemName = item.name;
            let mainName = itemName;
            let extras = '';
            if (itemName.includes('(') && itemName.endsWith(')')) {
              const idx = itemName.indexOf('(');
              mainName = itemName.substring(0, idx).trim();
              extras = itemName.substring(idx + 1, itemName.length - 1).trim();
            }
            return `
              <div class="item">
                <div class="item-name">${item.quantity}x ${mainName}</div>
                ${extras ? `<div class="item-detail">+ ${extras}</div>` : ''}
                ${item.notes ? `<div class="item-notes">Obs: ${item.notes}</div>` : ''}
                <div class="item-detail">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</div>
              </div>
            `;
          }).join('')}
        </div>
        <hr class="divider">
        <div class="total-line">
          <span>Subtotal:</span>
          <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
        </div>
        ${deliveryFee > 0 ? `
          <div class="total-line">
            <span>Entrega:</span>
            <span>R$ ${deliveryFee.toFixed(2).replace('.', ',')}</span>
          </div>
        ` : ''}
        <div class="grand-total">
          <span>TOTAL:</span>
          <span>R$ ${order.total.toFixed(2).replace('.', ',')}</span>
        </div>
        ${order.notes ? `<hr class="divider"><p class="notes"><strong>Obs:</strong> ${order.notes}</p>` : ''}
        <hr class="divider">
        <p class="footer">Obrigado pela preferência!</p>
        <script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 200); }</script>
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
            <span className="text-lg font-bold text-primary">#{order.orderCode || order.dailyNumber}</span>
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
                        {new Date(order.printedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
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
          {order.items.map((item) => {
            // For Lancheria da I9: parse grouped optionals from item name
            let displayName = item.name;
            let groupedOptionals: { groupName: string; items: string }[] = [];

            if (isLancheriaI9 && item.name.includes('(') && item.name.endsWith(')')) {
              const idx = item.name.indexOf('(');
              displayName = item.name.substring(0, idx).trim();
              const parenthesesContent = item.name.substring(idx + 1, item.name.length - 1).trim();
              // Check if new format with | separators and : group names
              const hasGroupFormat = parenthesesContent.includes(':');
              
              if (hasGroupFormat) {
                // New format: "GroupName: item1, item2 R$X.00 | GroupName2: item3"
                const groups = parenthesesContent.split('|').map(g => g.trim()).filter(Boolean);
                groups.forEach(groupStr => {
                  const colonIdx = groupStr.indexOf(':');
                  if (colonIdx > -1) {
                    const groupName = groupStr.substring(0, colonIdx).trim();
                    const itemsStr = groupStr.substring(colonIdx + 1).trim();
                    groupedOptionals.push({ groupName, items: itemsStr });
                  } else {
                    groupedOptionals.push({ groupName: 'Adicionais', items: groupStr });
                  }
                });
              } else {
                // Legacy format: "item1, item2, item3" - enrich with catalog prices
                const optNames = parenthesesContent.split(',').map(n => n.trim()).filter(Boolean);
                const productCatalog = optionalsCatalog[displayName] || {};
                const enrichedItems = optNames.map(name => {
                  const price = productCatalog[name];
                  if (price && price > 0) {
                    return `${name} R$${price.toFixed(2).replace('.', ',')}`;
                  }
                  return name;
                });
                groupedOptionals.push({ groupName: 'Adicionais', items: enrichedItems.join(', ') });
              }
            }

            return (
              <div key={item.id}>
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">
                    {item.quantity}x {displayName}
                  </span>
                  <span className="text-muted-foreground">
                    R$ {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
                {isLancheriaI9 && groupedOptionals.length > 0 && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {groupedOptionals.map((group, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        <span className="font-bold">{group.groupName}:</span> {group.items}
                      </p>
                    ))}
                  </div>
                )}
                {item.notes && (
                  <p className="text-xs text-muted-foreground italic ml-4">
                    ↳ <span className="font-bold not-italic">Observação:</span> {item.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Payment method, delivery type & troco extracted from notes */}
        {order.notes && (() => {
          const paymentMatch = order.notes?.match(/Pagamento:\s*([^|()\n]+)/i);
          const trocoMatch = isLancheriaI9 ? order.notes?.match(/Troco para R\$\s*([^)|\n]+)/i) : null;
          const isDelivery = !!order.deliveryAddress;
          return (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {paymentMatch && (
                <p>💳 Pagamento: {paymentMatch[1].trim()}</p>
              )}
              {isLancheriaI9 && trocoMatch && (
                <p>💵 Troco para: R$ {trocoMatch[1].trim()}</p>
              )}
              <p>{isDelivery ? '🛵 Entrega' : '🤲 Retirada'}</p>
            </div>
          );
        })()}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="shrink-0">
          <span className="text-sm text-muted-foreground">Total</span>
          <p className="text-lg font-bold text-foreground">
            R$ {order.total.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
            onClick={handlePrint}
            title="Imprimir pedido"
          >
            <Printer className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {order.status === 'pending' && (
            <Button
              size="sm"
              variant={confirmed ? 'outline' : 'secondary'}
              onClick={handleConfirmOrder}
              disabled={confirming || confirmed}
              className="gap-1 shrink-0 bg-green-600 hover:bg-green-700 text-white"
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmed ? 'Confirmado' : 'Confirmar'}
            </Button>
          )}
          {config.next && (
            <Button 
              size="sm" 
              onClick={handleAdvanceStatus}
              className="gap-1 shrink-0 px-3 inline-flex items-center"
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
