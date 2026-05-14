import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, ArrowLeftRight, Search } from 'lucide-react';
import { Order, OrderItem } from '@/types/order';
import { Product } from '@/types/product';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { useCategories } from '@/hooks/useCategories';
import { PDVV2CategoryBrowser } from '@/components/pdv-v2/PDVV2CategoryBrowser';
import { PDVOptionalsDialog } from '@/components/pdv/PDVOptionalsDialog';
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { stripDescMarkers, extractPaymentName } from '@/utils/orderNotesDisplay';
import { cn } from '@/lib/utils';

interface OrderEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
  companyId: string;
  storeName?: string;
  paperSize?: '58mm' | '80mm';
  /** Callback após salvar com sucesso para refetch imediato. */
  onSaved?: () => void;
}

type WorkingItem = OrderItem & {
  /** id existente no banco, se houver (itens novos não têm). */
  dbId?: string;
  /** Marcações apenas para a sessão de edição. */
  isNew?: boolean;
  swappedFrom?: string;
  /** Para itens novos / trocados, guardamos o productId selecionado para FK. */
  pendingProductId?: string;
};

function cleanProductName(name: string): string {
  if (name.includes('(') && name.endsWith(')')) {
    return name.substring(0, name.indexOf('(')).trim();
  }
  return name;
}

export function OrderEditDialog({
  open,
  onOpenChange,
  order,
  companyId,
  storeName = 'Comanda Tech',
  paperSize = '80mm',
  onSaved,
}: OrderEditDialogProps) {
  const { products } = useProducts({ companyId });
  const { groups: optionalGroups } = useOptionalGroups({ companyId });
  const { categories } = useCategories({ companyId });
  const [working, setWorking] = useState<WorkingItem[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Picker state
  const [pickerMode, setPickerMode] = useState<null | { type: 'add' } | { type: 'swap'; targetIndex: number }>(null);
  const [search, setSearch] = useState('');
  // Produto escolhido no browser (fluxo "Adicionar item") aguardando seleção de adicionais.
  const [optionalsProduct, setOptionalsProduct] = useState<Product | null>(null);

  // Hidrata estado de trabalho ao abrir
  useEffect(() => {
    if (!open) return;
    const items: WorkingItem[] = order.items.map((it) => ({ ...it, dbId: it.id }));
    setWorking(items);
    setOriginalIds(new Set(order.items.map((i) => i.id)));
    setPickerMode(null);
    setSearch('');
    setOptionalsProduct(null);
  }, [open, order.items]);

  const newTotal = useMemo(
    () => working.reduce((s, it) => s + it.price * it.quantity, 0),
    [working],
  );
  const subtotalOriginal = useMemo(
    () => order.items.reduce((s, it) => s + it.price * it.quantity, 0),
    [order.items],
  );
  // Preserva eventual taxa de entrega do pedido original.
  const deliveryFee = Math.max(0, order.total - subtotalOriginal);
  const newGrandTotal = newTotal + deliveryFee;
  const diff = newGrandTotal - order.total;

  const swappableProducts = useMemo(() => products.filter((p) => p.active && p.swappableInOrder), [products]);
  const allActiveProducts = useMemo(() => products.filter((p) => p.active), [products]);

  // Mapa Nome de Categoria -> id, para resolver grupos do produto (mesmo padrão do Pedido Express).
  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  function getGroupsForProduct(productId: string, productCategory: string): OptionalGroup[] {
    const catId = categoryIdByName[productCategory];
    return optionalGroups
      .filter((g) => {
        if (!g.active) return false;
        if (g.waiterOnly) return false;
        if (g.productIds.includes(productId)) return true;
        if (catId && g.categoryIds.includes(catId)) return true;
        return false;
      })
      .map((g) => {
        const override = g.productOverrides?.find((o) => o.productId === productId);
        if (override && (override.minSelectOverride !== null || override.maxSelectOverride !== null)) {
          return {
            ...g,
            minSelect: override.minSelectOverride ?? g.minSelect,
            maxSelect: override.maxSelectOverride ?? g.maxSelect,
          };
        }
        return g;
      });
  }

  // Lista filtrada do picker
  const pickerProducts = useMemo(() => {
    if (!pickerMode) return [];
    const q = search.trim().toLowerCase();
    if (pickerMode.type === 'swap') {
      const target = working[pickerMode.targetIndex];
      const targetClean = cleanProductName(target.name);
      const original = products.find((p) => p.name === targetClean);
      const targetCategory = original?.category;
      let list = swappableProducts;
      if (targetCategory) list = list.filter((p) => p.category === targetCategory);
      if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
      return list;
    }
    let list = allActiveProducts;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [pickerMode, search, working, products, swappableProducts, allActiveProducts]);

  function handleAddItem(product: Product) {
    setWorking((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: product.id,
        name: product.name,
        quantity: 1,
        price: product.price,
        notes: undefined,
        isNew: true,
        pendingProductId: product.id,
      },
    ]);
    setPickerMode(null);
    setSearch('');
  }

  /**
   * Handler para o browser de categorias (mesmo padrão do Pedido Express):
   * se o produto tem grupos de adicionais → abre PDVOptionalsDialog;
   * caso contrário → adiciona direto como nova linha.
   */
  function handleProductFromBrowser(product: Product) {
    const groups = getGroupsForProduct(product.id, product.category);
    if (groups.length > 0) {
      setOptionalsProduct(product);
      return;
    }
    handleAddItem(product);
  }

  /** Recebe os itens montados pelo PDVOptionalsDialog (já com nome composto + preço unitário). */
  function handleAddFromOptionals(items: Array<{ product_id: string | null; product_name: string; quantity: number; unit_price: number; }>) {
    if (!items.length) return;
    setWorking((prev) => {
      const next = [...prev];
      for (const it of items) {
        next.push({
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          productId: it.product_id || '',
          name: it.product_name,
          quantity: it.quantity,
          price: it.unit_price,
          notes: undefined,
          isNew: true,
          pendingProductId: it.product_id || undefined,
        });
      }
      return next;
    });
    setOptionalsProduct(null);
    setPickerMode(null);
    setSearch('');
  }

  function handleSwapItem(product: Product) {
    if (!pickerMode || pickerMode.type !== 'swap') return;
    const idx = pickerMode.targetIndex;
    setWorking((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const originalName = it.swappedFrom || cleanProductName(it.name);
        return {
          ...it,
          productId: product.id,
          pendingProductId: product.id,
          name: product.name,
          price: product.price,
          notes: undefined,
          swappedFrom: originalName,
        };
      }),
    );
    setPickerMode(null);
    setSearch('');
  }

  // Verifica se o item original (do banco) é trocável.
  function isItemSwappable(it: WorkingItem): boolean {
    const cleanName = cleanProductName(it.name);
    const prod = products.find((p) => p.id === it.productId || p.name === cleanName);
    if (it.isNew) return false; // recém-adicionado, não tem sentido trocar
    if (it.swappedFrom) {
      // já trocado nessa sessão — permitir trocar de novo
      return true;
    }
    return !!prod?.swappableInOrder;
  }

  function buildDeltaProductionHtml(
    addedOrSwapped: WorkingItem[],
    removedSwaps: { from: string; to: string }[],
  ): string {
    const items = addedOrSwapped.map((it) => {
      const note = it.swappedFrom ? `TROCADO de: ${it.swappedFrom}` : 'ITEM ADICIONADO';
      return {
        productName: cleanProductName(it.name),
        quantity: it.quantity,
        notes: note,
      };
    });
    return generateProductionTicketHTML({
      tabNumber: 0,
      customerName: order.customerName,
      items,
      createdAt: new Date(),
      paperSize,
      referenceLabel: `ALTERAÇÃO PEDIDO #${order.orderCode || order.dailyNumber}`,
    });
  }

  function buildUpdatedReceiptHtml(items: WorkingItem[]): string {
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const total = subtotal + deliveryFee;
    const dt = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const paymentLabel = extractPaymentName(order.notes) || '—';
    const itemsHtml = items
      .map((it) => {
        const cleanName = cleanProductName(it.name);
        const tag = it.isNew
          ? ' <b>[ADICIONADO]</b>'
          : it.swappedFrom
            ? ` <b>[TROCADO de: ${it.swappedFrom}]</b>`
            : '';
        const lineTotal = (it.price * it.quantity).toFixed(2).replace('.', ',');
        return `<div class="row"><span>${it.quantity}x ${cleanName}${tag}</span><span>R$ ${lineTotal}</span></div>`;
      })
      .join('');
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pedido EDITADO #${order.orderCode || order.dailyNumber}</title>
<style>
  @page { margin: 0; size: ${paperSize} auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${paperSize === '80mm' ? '11pt' : '10pt'}; font-weight: bold; width: ${paperSize}; max-width: ${paperSize}; padding: 2mm; line-height: 1.3; -webkit-print-color-adjust: exact; }
  .center { text-align: center; }
  .header { text-align: center; margin-bottom: 2mm; }
  .store-name { font-size: 12pt; font-weight: bold; }
  .order-num { font-size: 14pt; font-weight: bold; margin: 1mm 0; }
  .label-tag { font-size: 10pt; }
  .divider { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 4mm; font-size: 10pt; margin: 0.5mm 0; }
  .grand-total { display: flex; justify-content: space-between; font-size: 13pt; font-weight: bold; margin: 1mm 0; }
  .info { font-size: 9pt; margin: 0.5mm 0; }
  .footer { text-align: center; font-size: 8pt; margin-top: 2mm; }
  .label { font-weight: bold; }
</style></head><body>
  <div class="header">
    <div class="store-name">${storeName.toUpperCase()}</div>
    <div class="label-tag">RECIBO DO PEDIDO - EDITADO</div>
    <div class="order-num">#${order.orderCode || order.dailyNumber}</div>
    <div class="info">${dt}</div>
  </div>
  <hr class="divider">
  <div class="info"><span class="label">Cliente:</span> ${order.customerName}</div>
  ${order.customerPhone ? `<div class="info"><span class="label">Tel:</span> ${order.customerPhone}</div>` : ''}
  <hr class="divider">
  ${itemsHtml}
  <hr class="divider">
  <div class="row"><span>Subtotal</span><span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span></div>
  ${deliveryFee > 0 ? `<div class="row"><span>Entrega</span><span>R$ ${deliveryFee.toFixed(2).replace('.', ',')}</span></div>` : ''}
  <div class="grand-total"><span>TOTAL</span><span>R$ ${total.toFixed(2).replace('.', ',')}</span></div>
  <hr class="divider">
  <div class="info"><span class="label">Pagamento:</span> ${paymentLabel}</div>
  <hr class="divider">
  <div class="footer">Pedido editado pelo PDV</div>
</body></html>`;
  }

  async function sendWhatsAppNotification(items: WorkingItem[]): Promise<void> {
    if (!order.customerPhone) return;
    try {
      const { data: moduleData } = await supabase
        .from('company_modules')
        .select('enabled')
        .eq('company_id', companyId)
        .eq('module_name', 'whatsapp')
        .maybeSingle();
      if (!moduleData?.enabled) return;

      const { data: instanceData } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, status')
        .eq('company_id', companyId)
        .maybeSingle();
      if (instanceData?.status !== 'connected') return;

      const num = order.orderCode ? `#${order.orderCode}` : `#${String(order.dailyNumber).padStart(3, '0')}`;
      const lines: string[] = [];
      lines.push(`Olá, ${order.customerName.split(' ')[0]}! 👋`);
      lines.push('');
      lines.push(`Seu pedido ${num} foi *atualizado* com sucesso.`);
      lines.push('');
      lines.push('📋 *Pedido atualizado:*');
      for (const it of items) {
        const cleanName = cleanProductName(it.name);
        let prefix = '•';
        let suffix = '';
        if (it.isNew) {
          prefix = '➕';
          suffix = ' _(adicionado)_';
        } else if (it.swappedFrom) {
          prefix = '🔄';
          suffix = ` _(trocado de: ${it.swappedFrom})_`;
        }
        const lineTotal = (it.price * it.quantity).toFixed(2).replace('.', ',');
        lines.push(`${prefix} ${it.quantity}x ${cleanName} - R$ ${lineTotal}${suffix}`);
      }
      lines.push('');
      lines.push(`💰 *Novo total: R$ ${(newGrandTotal).toFixed(2).replace('.', ',')}*`);
      if (Math.abs(diff) > 0.001) {
        const sign = diff > 0 ? '+' : '-';
        lines.push(`(${sign}R$ ${Math.abs(diff).toFixed(2).replace('.', ',')} em relação ao pedido original)`);
      }
      const message = lines.join('\n');

      await supabase.functions.invoke('whatsapp-evolution', {
        body: {
          action: 'send_message',
          instanceName: instanceData.instance_name,
          phone: order.customerPhone,
          message,
          companyId,
          orderId: order.id,
        },
      });
    } catch (e) {
      console.warn('[OrderEdit] Falha ao enviar WhatsApp de edição:', e);
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      // Diff: novos itens (sem dbId) + trocas (com dbId mas swappedFrom).
      const inserts: WorkingItem[] = [];
      const updates: WorkingItem[] = [];
      for (const it of working) {
        if (!it.dbId || it.isNew) {
          inserts.push(it);
        } else if (it.swappedFrom) {
          updates.push(it);
        }
      }

      // Persistir UPDATES (trocas)
      for (const u of updates) {
        const { error } = await supabase
          .from('order_items')
          .update({
            product_id: u.pendingProductId || u.productId,
            name: u.name,
            price: u.price,
            notes: null,
            swapped_from: u.swappedFrom,
          } as any)
          .eq('id', u.dbId!);
        if (error) throw error;
      }

      // Persistir INSERTS (itens adicionados)
      const insertedRows: any[] = [];
      if (inserts.length > 0) {
        const payload = inserts.map((it) => ({
          order_id: order.id,
          company_id: companyId,
          product_id: it.pendingProductId || it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          notes: null,
          added_after: true,
        }));
        const { data, error } = await supabase
          .from('order_items')
          .insert(payload as any)
          .select();
        if (error) throw error;
        insertedRows.push(...(data || []));
      }

      // Recalcular total e marcar audit trail nas notas.
      const stamp = new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
      const auditTag = ` [EDITADO ${stamp}]`;
      const newNotes = (order.notes || '') + auditTag;

      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          total: newGrandTotal,
          notes: newNotes,
        })
        .eq('id', order.id);
      if (orderErr) throw orderErr;

      // Itens "delta" para impressão (apenas adicionados/trocados).
      const deltaItems: WorkingItem[] = [...inserts, ...updates];

      // Comanda de produção delta + recibo atualizado → print_queue.
      try {
        if (deltaItems.length > 0) {
          const html = buildDeltaProductionHtml(deltaItems, []);
          await supabase.from('print_queue').insert({
            company_id: companyId,
            html_content: html,
            label: `EDIÇÃO ${order.customerName} #${order.orderCode || order.dailyNumber}`,
          } as any);
        }
        const receiptHtml = buildUpdatedReceiptHtml(working);
        await supabase.from('print_queue').insert({
          company_id: companyId,
          html_content: receiptHtml,
          label: `RECIBO EDITADO #${order.orderCode || order.dailyNumber}`,
        } as any);
      } catch (e) {
        console.warn('[OrderEdit] Falha ao enfileirar impressão:', e);
      }

      // WhatsApp para o cliente (best-effort)
      void sendWhatsAppNotification(working);

      toast.success('Pedido editado com sucesso!');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      console.error('[OrderEdit] erro ao salvar:', e);
      toast.error('Erro ao salvar edição: ' + (e?.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Editar Pedido #{order.orderCode || order.dailyNumber}
          </DialogTitle>
        </DialogHeader>

        {pickerMode ? (
          pickerMode.type === 'add' ? (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Adicionar item ao pedido</span>
                <Button variant="ghost" size="sm" onClick={() => { setPickerMode(null); setSearch(''); }}>
                  Cancelar
                </Button>
              </div>
              <div className="flex-1 min-h-0 border rounded-md p-2">
                <PDVV2CategoryBrowser
                  companyId={companyId}
                  pdvOnly={true}
                  onProductSelect={handleProductFromBrowser}
                  maxHeightClassName="max-h-[60vh]"
                />
              </div>
            </div>
          ) : (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={'Buscar item para trocar (mesma categoria)...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="ghost" size="sm" onClick={() => { setPickerMode(null); setSearch(''); }}>
                Cancelar
              </Button>
            </div>
            <ScrollArea className="flex-1 min-h-0 border rounded-md">
              <div className="p-2 space-y-1">
                {pickerProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">
                    Nenhum produto trocável encontrado nesta categoria.
                  </p>
                )}
                {pickerProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSwapItem(p)}
                    className="w-full flex items-center justify-between p-2 rounded hover:bg-accent text-left"
                  >
                    <span className="text-sm">{p.name}</span>
                    <span className="text-sm text-green-600 font-semibold">
                      R$ {p.price.toFixed(2).replace('.', ',')}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          )
        ) : (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <ScrollArea className="flex-1 min-h-0 border rounded-md">
              <div className="p-2 space-y-2">
                {working.map((it, idx) => {
                  const cleanName = cleanProductName(it.name);
                  const swappable = isItemSwappable(it);
                  return (
                    <div
                      key={it.id}
                      className={cn(
                        'flex items-center justify-between gap-2 p-2 rounded border',
                        it.isNew && 'border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/20',
                        it.swappedFrom && 'border-amber-500/60 bg-amber-50/50 dark:bg-amber-950/20',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {it.quantity}x {cleanName}
                        </div>
                        {it.swappedFrom && (
                          <div className="text-xs text-amber-700 dark:text-amber-300">
                            🔄 trocado de: {it.swappedFrom}
                          </div>
                        )}
                        {it.isNew && (
                          <div className="text-xs text-emerald-700 dark:text-emerald-300">
                            ➕ adicionado agora
                          </div>
                        )}
                        {it.notes && !it.isNew && !it.swappedFrom && (
                          <div className="text-xs text-muted-foreground truncate">
                            {stripDescMarkers(it.notes)}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-green-600 whitespace-nowrap">
                        R$ {(it.price * it.quantity).toFixed(2).replace('.', ',')}
                      </div>
                      {swappable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPickerMode({ type: 'swap', targetIndex: idx })}
                          className="gap-1 shrink-0"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Trocar
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <Button
              variant="outline"
              onClick={() => setPickerMode({ type: 'add' })}
              className="gap-1 self-start"
            >
              <Plus className="w-4 h-4" />
              Adicionar item
            </Button>

            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total original</span>
                <span>R$ {order.total.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Novo total</span>
                <span className="text-green-600">R$ {newGrandTotal.toFixed(2).replace('.', ',')}</span>
              </div>
              {Math.abs(diff) > 0.001 && (
                <div className={cn('flex justify-between text-xs', diff > 0 ? 'text-emerald-700' : 'text-amber-700')}>
                  <span>Diferença</span>
                  <span>{diff > 0 ? '+' : '-'} R$ {Math.abs(diff).toFixed(2).replace('.', ',')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !!pickerMode}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar edição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {optionalsProduct && (
      <PDVOptionalsDialog
        open={!!optionalsProduct}
        onOpenChange={(o) => { if (!o) setOptionalsProduct(null); }}
        product={{
          id: optionalsProduct.id,
          name: optionalsProduct.name,
          price: optionalsProduct.price,
          imageUrl: optionalsProduct.imageUrl,
          category: optionalsProduct.category,
        }}
        groups={getGroupsForProduct(optionalsProduct.id, optionalsProduct.category)}
        onAddToCart={handleAddFromOptionals}
        companyId={companyId}
      />
    )}
    </>
  );
}