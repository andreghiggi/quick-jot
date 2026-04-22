import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { parseItemNotes } from '@/utils/orderNotesDisplay';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapPin, Truck, Store, CreditCard, Banknote, Loader2 } from 'lucide-react';

interface OrderDetailDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  delivered: 'bg-muted text-muted-foreground',
};

function parseOrderNotes(notes: string | null) {
  if (!notes) return {};
  const paymentMatch = notes.match(/Pagamento:\s*([^(|\n]+)/i);
  const trocoMatch = notes.match(/Troco para R\$\s*([^)|\n]+)/i);
  const cpfMatch = notes.match(/CPF:\s*([^\n|]+)/i);
  const cidadeMatch = notes.match(/Cidade:\s*([^\n|]+)/i);
  const estadoMatch = notes.match(/Estado:\s*([^\n|]+)/i);
  const pixKeyMatch = notes.match(/Chave PIX:\s*([^)]+)\)/i);
  // Strip parsed fields to get "clean" observations
  let cleanNotes = notes;
  [/Pagamento:[^\n|]*/gi, /Troco para R\$[^\n|)]*/gi, /CPF:[^\n|]*/gi, /Cidade:[^\n|]*/gi, /Estado:[^\n|]*/gi, /Chave PIX:[^)]*\)/gi, /\|\s*/g]
    .forEach(r => { cleanNotes = cleanNotes.replace(r, ''); });
  cleanNotes = cleanNotes.replace(/\n{2,}/g, '\n').trim();

  return {
    paymentMethod: paymentMatch?.[1]?.trim() || null,
    troco: trocoMatch?.[1]?.trim() || null,
    cpf: cpfMatch?.[1]?.trim() || null,
    cidade: cidadeMatch?.[1]?.trim() || null,
    estado: estadoMatch?.[1]?.trim() || null,
    pixKey: pixKeyMatch?.[1]?.trim() || null,
    cleanNotes: cleanNotes || null,
  };
}

interface ParsedItem {
  displayName: string;
  quantity: number;
  price: number;
  notes: string | null;
  groups: { groupName: string; items: string }[];
}

function parseItemName(name: string): { displayName: string; groups: { groupName: string; items: string }[] } {
  if (!name.includes('(') || !name.endsWith(')')) {
    return { displayName: name, groups: [] };
  }
  const idx = name.indexOf('(');
  const displayName = name.substring(0, idx).trim();
  const content = name.substring(idx + 1, name.length - 1).trim();
  const groups: { groupName: string; items: string }[] = [];

  if (content.includes(':')) {
    content.split('|').map(g => g.trim()).filter(Boolean).forEach(groupStr => {
      const colonIdx = groupStr.indexOf(':');
      if (colonIdx > -1) {
        groups.push({ groupName: groupStr.substring(0, colonIdx).trim(), items: groupStr.substring(colonIdx + 1).trim() });
      } else {
        groups.push({ groupName: 'Adicionais', items: groupStr });
      }
    });
  } else if (content) {
    groups.push({ groupName: 'Adicionais', items: content });
  }

  return { displayName, groups };
}

export function OrderDetailDialog({ orderId, open, onOpenChange }: OrderDetailDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).single(),
        supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      ]);
      if (orderRes.error) throw orderRes.error;
      return { order: orderRes.data, items: itemsRes.data || [] };
    },
    enabled: !!orderId && open,
  });

  const order = data?.order;
  const items = data?.items || [];
  const parsed = parseOrderNotes(order?.notes || null);
  const isDelivery = !!order?.delivery_address;

  const parsedItems: ParsedItem[] = items.map(item => {
    const { displayName, groups } = parseItemName(item.name);
    return {
      displayName,
      quantity: item.quantity,
      price: Number(item.price),
      notes: item.notes || null,
      groups,
    };
  });

  const subtotal = parsedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = order ? Number(order.total) - subtotal : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {isLoading || !order ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="text-xl font-mono">#{order.order_code}</span>
                <Badge variant="secondary" className={cn('text-xs', statusColors[order.status])}>
                  {statusLabels[order.status] || order.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* Date & time */}
              <div className="text-sm text-muted-foreground">
                {format(new Date(order.created_at), "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </div>

              <Separator />

              {/* Delivery type */}
              <div className="flex items-center gap-2">
                {isDelivery ? (
                  <>
                    <Truck className="h-4 w-4 text-primary" />
                    <span className="font-medium">Entrega</span>
                  </>
                ) : (
                  <>
                    <Store className="h-4 w-4 text-primary" />
                    <span className="font-medium">Retirada no Local</span>
                  </>
                )}
              </div>

              {/* Delivery address */}
              {isDelivery && order.delivery_address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span>{order.delivery_address}</span>
                </div>
              )}

              {/* Payment */}
              {parsed.paymentMethod && (
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span>{parsed.paymentMethod}</span>
                  {parsed.pixKey && <span className="text-muted-foreground">(PIX: {parsed.pixKey})</span>}
                </div>
              )}

              {/* Change */}
              {parsed.troco && (
                <div className="flex items-center gap-2 text-sm">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  <span>Troco para R$ {parsed.troco}</span>
                </div>
              )}

              <Separator />

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Produtos</h4>
                <div className="space-y-3">
                  {parsedItems.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className="font-semibold">{item.quantity}x {item.displayName}</span>
                        </div>
                        <span className="text-sm font-medium ml-2 shrink-0">
                          {(item.price * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>

                      {/* Grouped optionals */}
                      {item.groups.map((g, gIdx) => (
                        <div key={gIdx} className="ml-4 text-sm text-muted-foreground">
                          <span className="font-medium">{g.groupName}:</span>{' '}
                          <span>{g.items}</span>
                        </div>
                      ))}

                      {/* Item description (cadastro do produto) e observação (cliente) */}
                      {(() => {
                        const { description, observation } = parseItemNotes(item.notes);
                        return (
                          <>
                            {description && (
                              <div className="ml-4 text-sm">
                                <span className="text-muted-foreground">↳ </span>
                                <span className="font-medium">Descrição: </span>
                                <span className="text-muted-foreground">{description}</span>
                              </div>
                            )}
                            {observation && (
                              <div className="ml-4 text-sm">
                                <span className="text-muted-foreground">↳ </span>
                                <span className="font-medium">Observação: </span>
                                <span className="italic text-muted-foreground">{observation}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxa de entrega</span>
                    <span>{deliveryFee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-1">
                  <span>Total</span>
                  <span>{Number(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>

              {/* Clean notes */}
              {parsed.cleanNotes && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <span className="font-medium">Observações:</span>
                    <p className="text-muted-foreground mt-1">{parsed.cleanNotes}</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
