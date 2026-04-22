import { useState, useEffect, useMemo } from 'react';
import { Order, OrderStatus } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, MapPin, ChevronRight, Trash2, Printer, CheckCircle2, Check, Loader2, RotateCcw, Receipt } from 'lucide-react';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { stripDescMarkers, parseItemNotes } from '@/utils/orderNotesDisplay';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  parseTefDataFromNotes,
  isOrderTefCancelled,
  estornarTefPedido,
  reimprimirComprovanteTef,
} from '@/utils/tefOrderActions';

interface OrderCardProps {
  order: Order;
  paperSize?: '58mm' | '80mm';
  storeName?: string;
  headerExtra?: React.ReactNode;
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

export function OrderCard({ order, paperSize = '58mm', storeName = 'Comanda Tech', headerExtra }: OrderCardProps) {
  const { updateOrderStatus, deleteOrder, sendConfirmationWhatsApp } = useOrderContext();
  const { company } = useAuthContext();
  
  const config = statusConfig[order.status];
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [tefEstornoLoading, setTefEstornoLoading] = useState(false);
  const confirmed = !!order.confirmedAt;

  // Detecta se é pagamento TEF e se já foi estornado
  const tefInfo = useMemo(() => parseTefDataFromNotes(order.notes), [order.notes]);
  const tefAlreadyCancelled = isOrderTefCancelled(order.notes);
  const hasTefReceipt = !!tefInfo?.receipt;
  
  // Catalog lookup to enrich legacy order items with prices and group names
  const [optionalsCatalog, setOptionalsCatalog] = useState<Record<string, Record<string, { price: number; groupName: string }>>>({});
  useEffect(() => {
    if (!company?.id) return;
    
    Promise.all([
      supabase.from('product_optionals').select('name, price, product_id, products!inner(name, company_id)').eq('products.company_id', company.id).eq('active', true),
      supabase.from('optional_group_items').select('name, price, group_id, optional_groups!inner(name, company_id)').eq('optional_groups.company_id', company.id).eq('active', true),
      supabase.from('optional_group_products').select('group_id, product_id, products!inner(name, company_id)').eq('products.company_id', company.id),
      supabase.from('optional_group_categories').select('group_id, category_id, categories!inner(name, company_id)').eq('categories.company_id', company.id),
      supabase.from('products').select('id, name, category, company_id').eq('company_id', company.id).eq('active', true),
    ]).then(([prodOptRes, groupItemsRes, groupProdsRes, groupCatsRes, productsRes]) => {
      const catalog: Record<string, Record<string, { price: number; groupName: string }>> = {};
      
      // Add product_optionals (paid extras)
      (prodOptRes.data || []).forEach((row: any) => {
        const productName = row.products?.name;
        if (!productName) return;
        if (!catalog[productName]) catalog[productName] = {};
        catalog[productName][row.name] = { price: Number(row.price), groupName: 'Adicionais' };
      });
      
      // Build group-to-products map from direct product associations
      const groupToProducts: Record<string, Set<string>> = {};
      (groupProdsRes.data || []).forEach((row: any) => {
        const productName = row.products?.name;
        if (!productName) return;
        if (!groupToProducts[row.group_id]) groupToProducts[row.group_id] = new Set();
        groupToProducts[row.group_id].add(productName);
      });
      
      // Build group-to-products map from category associations
      (groupCatsRes.data || []).forEach((row: any) => {
        const categoryName = row.categories?.name;
        if (!categoryName) return;
        if (!groupToProducts[row.group_id]) groupToProducts[row.group_id] = new Set();
        (productsRes.data || []).forEach((p: any) => {
          if (p.category === categoryName) {
            groupToProducts[row.group_id].add(p.name);
          }
        });
      });
      
      // Add optional_group_items with their group names
      (groupItemsRes.data || []).forEach((row: any) => {
        const groupName = row.optional_groups?.name;
        if (!groupName) return;
        const productNames = groupToProducts[row.group_id];
        if (productNames) {
          productNames.forEach((productName: string) => {
            if (!catalog[productName]) catalog[productName] = {};
            catalog[productName][row.name] = { price: Number(row.price), groupName };
          });
        }
        // Wildcard entry for unmapped products
        if (!catalog['__groups__']) catalog['__groups__'] = {};
        catalog['__groups__'][row.name] = { price: Number(row.price), groupName };
      });
      
      setOptionalsCatalog(catalog);
    });
  }, [company?.id]);
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
    await sendConfirmationWhatsApp(order.id);
    setConfirming(false);
  }

  async function handleAdvanceStatus() {
    if (config.next && !advancing) {
      setAdvancing(true);
      try {
        await updateOrderStatus(order.id, config.next);
      } finally {
        setAdvancing(false);
      }
    }
  }

  async function handleDelete() {
    console.log('[OrderCard] Excluindo pedido:', order.id, order.orderCode);
    const ok = await deleteOrder(order.id);
    if (ok) {
      toast.success(`Pedido #${order.orderCode || order.dailyNumber} excluído`);
    }
  }

  async function handleTefEstorno() {
    if (!company?.id || !tefInfo) return;
    if (tefAlreadyCancelled) {
      toast.error('Esta venda TEF já foi estornada');
      return;
    }
    const confirmMsg = `Estornar transação TEF?\n\nValor: R$ ${order.total.toFixed(2).replace('.', ',')}\nNSU: ${tefInfo.nsu}\nBandeira: ${tefInfo.cardBrand}\n\nO cartão será estornado e o pedido cancelado.`;
    if (!window.confirm(confirmMsg)) return;

    setTefEstornoLoading(true);
    try {
      const result = await estornarTefPedido({
        companyId: company.id,
        amount: order.total,
        createdAt: order.createdAt,
        notes: order.notes,
      });

      if (result.success && result.cancelledNotes) {
        toast.success(result.message || 'Estorno aprovado!');
        // Persiste a marca [CANCELADA] no notes — mantém o status original
        // para que o pedido continue visível na aba atual marcado como Cancelada.
        await supabase
          .from('orders')
          .update({ notes: result.cancelledNotes })
          .eq('id', order.id);
      } else {
        toast.error(result.message || 'Falha no estorno');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado no estorno');
    } finally {
      setTefEstornoLoading(false);
    }
  }

  function handleReimprimirTef() {
    reimprimirComprovanteTef(order.notes, order.orderCode || String(order.dailyNumber || ''));
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
                ${item.notes ? `<div class="item-notes">Obs: ${stripDescMarkers(item.notes)}</div>` : ''}
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

  // Detecta se o pedido foi cancelado/estornado (qualquer pagamento — TEF, PIX etc.)
  const isCancelled = !!order.notes?.includes('[CANCELADA]');

  return (
    <div className={cn(
      "bg-card rounded-xl p-4 shadow-card border-2 animate-slide-up relative",
      "hover:shadow-lg transition-shadow duration-200",
      isCancelled
        ? "border-destructive/60 bg-destructive/5 opacity-80"
        : config.borderColor
    )}>
      {isCancelled && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-3 right-3 -rotate-12 select-none border-2 border-destructive text-destructive font-extrabold uppercase tracking-wider text-xs px-2 py-0.5 rounded opacity-80"
        >
          Cancelada
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn(
              "text-lg font-bold",
              isCancelled ? "text-destructive line-through" : "text-primary"
            )}>#{order.orderCode || order.dailyNumber}</span>
            {isCancelled ? (
              <Badge variant="destructive" className="text-xs">Cancelada</Badge>
            ) : (
              <Badge className={cn("text-xs border", config.bgColor, config.textColor, config.borderColor)}>
                {config.label}
              </Badge>
            )}
            {headerExtra}
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
            // Parse grouped optionals from item name
            let displayName = item.name;
            let groupedOptionals: { groupName: string; items: string }[] = [];

            if (item.name.includes('(') && item.name.endsWith(')')) {
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
                // Legacy format: "item1, item2, item3" - enrich with catalog prices and group names
                const optNames = parenthesesContent.split(',').map(n => n.trim()).filter(Boolean);
                const productCatalog = optionalsCatalog[displayName] || {};
                const wildcardCatalog = optionalsCatalog['__groups__'] || {};
                // Group items by their group name from the catalog
                const groupMap: Record<string, string[]> = {};
                optNames.forEach(name => {
                  const catalogEntry = productCatalog[name] || wildcardCatalog[name];
                  const groupName = catalogEntry?.groupName || 'Adicionais';
                  const price = catalogEntry?.price ?? 0;
                  const displayStr = price > 0 ? `${name} R$${price.toFixed(2).replace('.', ',')}` : name;
                  if (!groupMap[groupName]) groupMap[groupName] = [];
                  groupMap[groupName].push(displayStr);
                });
                Object.entries(groupMap).forEach(([groupName, items]) => {
                  groupedOptionals.push({ groupName, items: items.join(', ') });
                });
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
                {groupedOptionals.length > 0 && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {groupedOptionals.map((group, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        <span className="font-bold">{group.groupName}:</span> {group.items}
                      </p>
                    ))}
                  </div>
                )}
                {(() => {
                  const { description, observation } = parseItemNotes(item.notes);
                  return (
                    <>
                      {description && (
                        <p className="text-xs text-muted-foreground ml-4">
                          ↳ <span className="font-bold">Descrição:</span> {description}
                        </p>
                      )}
                      {observation && (
                        <p className="text-xs text-muted-foreground italic ml-4">
                          ↳ <span className="font-bold not-italic">Observação:</span> {observation}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Payment method, delivery type & troco extracted from notes */}
        {order.notes && (() => {
          const paymentMatch = order.notes?.match(/Pagamento:\s*([^|()\n]+)/i);
          const trocoMatch = order.notes?.match(/Troco para R\$\s*([^)|\n]+)/i) || null;
          const isDelivery = !!order.deliveryAddress;
          const paymentLabel = paymentMatch?.[1].trim();
          const isTefPayment = !!tefInfo;
          return (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {paymentMatch && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>💳 Pagamento: {paymentLabel}</span>
                  {isTefPayment && hasTefReceipt && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleReimprimirTef}
                            className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            aria-label="Reimprimir comprovante TEF"
                          >
                            <Receipt className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Reimprimir comprovante TEF</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {isTefPayment && tefInfo?.type === 'pinpad' && !tefAlreadyCancelled && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleTefEstorno}
                            disabled={tefEstornoLoading}
                            className="inline-flex items-center justify-center h-5 w-5 rounded text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors disabled:opacity-50"
                            aria-label="Estornar TEF"
                          >
                            {tefEstornoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Estornar TEF e cancelar pedido</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {isTefPayment && tefAlreadyCancelled && (
                    <span className="text-[10px] font-semibold text-destructive uppercase">Estornado</span>
                  )}
                </div>
              )}
              {isTefPayment && tefInfo?.operationType && (
                <p className="ml-4 text-[11px] italic">↳ {tefInfo.operationType}</p>
              )}
              {trocoMatch && (
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
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                title="Excluir pedido"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
                <AlertDialogDescription>
                  O pedido #{order.orderCode || order.dailyNumber} de {order.customerName} será excluído permanentemente. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {!isCancelled && order.status === 'pending' && (
            <Button
              size="sm"
              variant={confirmed ? 'outline' : 'secondary'}
              onClick={handleConfirmOrder}
              disabled={confirming || confirmed}
              className={cn(
                "gap-1 shrink-0",
                confirmed
                  ? "bg-gray-400 text-white cursor-not-allowed opacity-50"
                  : "bg-green-600 hover:bg-green-700 text-white"
              )}
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmed ? 'Confirmado' : 'Confirmar'}
            </Button>
          )}
          {!isCancelled && config.next && (
            <Button 
              size="sm" 
              onClick={handleAdvanceStatus}
              disabled={advancing || (order.status === 'pending' && !confirmed)}
              className={cn(
                "gap-1 shrink-0 px-3 inline-flex items-center",
                order.status === 'pending' && !confirmed
                  ? "opacity-50 cursor-not-allowed bg-gray-400 text-white hover:bg-gray-400"
                  : order.status === 'pending' && confirmed
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : ""
              )}
            >
              {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {nextStatusLabel[order.status]}
              {!advancing && <ChevronRight className="w-4 h-4" />}
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
