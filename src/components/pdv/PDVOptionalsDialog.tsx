import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { OptionalGroup } from '@/hooks/useOptionalGroups';

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
}

export function PDVOptionalsDialog({
  open,
  onOpenChange,
  product,
  groups,
  onAddToCart,
}: PDVOptionalsDialogProps) {
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // Reset state when product changes
  const resetState = () => {
    setSelectedItems({});
    setQuantity(1);
    setNotes('');
  };

  function toggleGroupItem(groupId: string, itemId: string, maxSelect: number) {
    setSelectedItems(prev => {
      const current = new Set(prev[groupId] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        if (maxSelect === 1) {
          return { ...prev, [groupId]: new Set([itemId]) };
        }
        if (current.size < maxSelect) {
          current.add(itemId);
        }
      }
      return { ...prev, [groupId]: current };
    });
  }

  // Calculate total with optionals
  const optionalsTotal = useMemo(() => {
    let total = 0;
    groups.forEach(group => {
      const selected = selectedItems[group.id];
      if (selected) {
        group.items.forEach(item => {
          if (selected.has(item.id)) {
            total += item.price;
          }
        });
      }
    });
    return total;
  }, [selectedItems, groups]);

  const unitTotal = product.price + optionalsTotal;
  const lineTotal = unitTotal * quantity;

  // Check if all required groups are satisfied
  const allRequiredSatisfied = groups.every(group => {
    const selected = selectedItems[group.id]?.size || 0;
    return selected >= group.minSelect;
  });

  function handleAdd() {
    // Build product name with optionals
    const optionalNames: string[] = [];
    groups.forEach(group => {
      const selected = selectedItems[group.id];
      if (selected && selected.size > 0) {
        group.items.forEach(item => {
          if (selected.has(item.id)) {
            optionalNames.push(item.name);
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
            {groups.map(group => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-bold text-sm">{group.name}</Label>
                  <Badge variant={
                    (selectedItems[group.id]?.size || 0) >= group.minSelect ? 'default' : 'destructive'
                  } className="text-[10px]">
                    {group.minSelect > 0 ? `Mín: ${group.minSelect}` : 'Opcional'}
                    {group.maxSelect > 0 && ` | Máx: ${group.maxSelect}`}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {group.items.filter(i => i.active).map(item => {
                    const isSelected = selectedItems[group.id]?.has(item.id) || false;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
                        }`}
                        onClick={() => toggleGroupItem(group.id, item.id, group.maxSelect)}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isSelected} />
                          <span className="text-sm">{item.name}</span>
                        </div>
                        {item.price > 0 && (
                          <span className="text-xs text-muted-foreground">
                            +{formatCurrency(item.price)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

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
