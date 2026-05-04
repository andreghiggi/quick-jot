import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { OptionalGroup } from '@/hooks/useOptionalGroups';

const LANCHERIA_I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';

interface PDVOptionalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl?: string | null;
    category: string;
  };
  groups: OptionalGroup[];
  onAddToCart: (items: Array<{
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
  }>) => void;
  companyId?: string;
}

export function PDVOptionalsDialog({
  open,
  onOpenChange,
  product,
  groups,
  onAddToCart,
  companyId,
}: PDVOptionalsDialogProps) {
  const isI9 = companyId === LANCHERIA_I9_COMPANY_ID;
  const [selectedItems, setSelectedItems] = useState<Record<string, Map<string, number>>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const resetState = () => {
    setSelectedItems({});
    setQuantity(1);
    setNotes('');
  };

  function toggleGroupItem(groupId: string, itemId: string, maxSelect: number) {
    setSelectedItems(prev => {
      const current = new Map(prev[groupId] || []);
      const currentQty = current.get(itemId) || 0;
      if (currentQty > 0) {
        current.delete(itemId);
      } else {
        const effectiveMax = maxSelect <= 0 ? Infinity : maxSelect;
        let totalSel = 0;
        current.forEach(q => { totalSel += q; });
        if (effectiveMax === 1) {
          current.clear();
          current.set(itemId, 1);
        } else if (totalSel >= effectiveMax) {
          return prev;
        } else {
          current.set(itemId, 1);
        }
      }
      return { ...prev, [groupId]: current };
    });
  }

  function changeGroupItemQty(groupId: string, itemId: string, delta: number, maxSelect: number, maxPerItem: number) {
    const maxGroup = maxSelect > 0 ? maxSelect : Infinity;
    setSelectedItems(prev => {
      const cur = new Map(prev[groupId] || []);
      const currentQty = cur.get(itemId) || 0;
      const newQty = currentQty + delta;
      if (newQty <= 0) {
        cur.delete(itemId);
      } else if (newQty > maxPerItem) {
        return prev;
      } else {
        let prevTotal = 0;
        (prev[groupId] || new Map()).forEach(q => { prevTotal += q; });
        const totalSel = prevTotal - currentQty + newQty;
        if (totalSel > maxGroup) {
          return prev;
        }
        cur.set(itemId, newQty);
      }
      return { ...prev, [groupId]: cur };
    });
  }

  const optionalsTotal = useMemo(() => {
    let total = 0;
    groups.forEach(group => {
      const selected = selectedItems[group.id];
      if (selected) {
        group.items.forEach(item => {
          const qty = selected.get(item.id) || 0;
          if (qty > 0) {
            total += item.price * qty;
          }
        });
      }
    });
    return total;
  }, [selectedItems, groups]);

  const unitTotal = product.price + optionalsTotal;
  const lineTotal = unitTotal * quantity;

  const allRequiredSatisfied = groups.every(group => {
    const selected = selectedItems[group.id];
    let count = 0;
    if (selected) selected.forEach(q => { count += q; });
    return count >= group.minSelect;
  });

  function handleAdd() {
    const optionalNames: string[] = [];
    groups.forEach(group => {
      const selected = selectedItems[group.id];
      if (selected && selected.size > 0) {
        group.items.forEach(item => {
          const qty = selected.get(item.id) || 0;
          if (qty > 0) {
            optionalNames.push(qty > 1 ? `${qty}x ${item.name}` : item.name);
          }
        });
      }
    });

    const fullName = optionalNames.length > 0
      ? `${product.name} (${optionalNames.join(', ')})`
      : product.name;

    const notesAppend = notes.trim() ? ` [${notes.trim()}]` : '';

    onAddToCart([{
      product_id: product.id,
      product_name: fullName + notesAppend,
      quantity,
      unit_price: unitTotal,
    }]);

    resetState();
    onOpenChange(false);
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function getGroupCount(groupId: string): number {
    let c = 0;
    selectedItems[groupId]?.forEach(q => { c += q; });
    return c;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) resetState();
      onOpenChange(o);
    }}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{product.name}</DialogTitle>
          <p className="text-primary font-bold">{formatCurrency(product.price)}</p>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4">
            {groups.map(group => {
              const useQtyControls = isI9 && group.maxQuantityPerItem > 1;
              return (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-bold text-sm">{group.name}</Label>
                  <Badge variant={
                    getGroupCount(group.id) >= group.minSelect ? 'default' : 'destructive'
                  } className="text-[10px]">
                    {group.minSelect > 0 ? `Mín: ${group.minSelect}` : 'Opcional'}
                    {group.maxSelect > 0 && ` | Máx: ${group.maxSelect}`}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {group.items.filter(i => i.active).map(item => {
                    const qty = selectedItems[group.id]?.get(item.id) || 0;
                    const isSelected = qty > 0;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
                        } ${!useQtyControls ? 'cursor-pointer' : ''}`}
                        onClick={!useQtyControls ? () => toggleGroupItem(group.id, item.id, group.maxSelect) : undefined}
                      >
                        <div className="flex items-center gap-2">
                          {!useQtyControls && <Checkbox checked={isSelected} />}
                          <span className="text-sm">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.price > 0 && (
                            <span className="text-xs text-muted-foreground">
                              +{formatCurrency(item.price)}
                            </span>
                          )}
                          {useQtyControls && (
                            <div className="flex items-center gap-1">
                              <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => changeGroupItemQty(group.id, item.id, -1, group.maxSelect, group.maxQuantityPerItem)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-5 text-center text-xs tabular-nums">{qty}</span>
                              <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => changeGroupItemQty(group.id, item.id, 1, group.maxSelect, group.maxQuantityPerItem)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea
                placeholder="Ex: sem cebola, bem passado..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-16"
              />
            </div>

            {/* Quantity */}
            <div className="flex items-center justify-between">
              <Label>Quantidade</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="w-8 text-center font-bold">{quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-3">
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm">
              <span>Unitário:</span>
              <span className="font-medium">{formatCurrency(unitTotal)}</span>
            </div>
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleAdd}
              disabled={!allRequiredSatisfied}
            >
              <ShoppingCart className="w-4 h-4" />
              Adicionar {formatCurrency(lineTotal)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
