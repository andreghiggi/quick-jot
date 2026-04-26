import { useState, useEffect } from 'react';
import { Product, ProductOptional } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn, formatPrice } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, ShoppingCart } from 'lucide-react';

interface OptionalGroupItem {
  id: string;
  name: string;
  price: number;
  active: boolean;
  imageUrl?: string | null;
}

interface OptionalGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  layout: string;
  items: OptionalGroupItem[];
}

interface LateralOptionalsWizardProps {
  product: Product;
  groups: OptionalGroup[];
  oldStyleOptionals: ProductOptional[];
  selectedOptionals: ProductOptional[];
  selectedGroupItems: Record<string, Set<string>>;
  itemNotes: string;
  onToggleOptional: (optional: ProductOptional) => void;
  onToggleGroupItem: (groupId: string, itemId: string, maxSelect: number) => void;
  onNotesChange: (notes: string) => void;
  onAddToCart: () => void;
}

export function LateralOptionalsWizard({
  product,
  groups,
  oldStyleOptionals,
  selectedOptionals,
  selectedGroupItems,
  itemNotes,
  onToggleOptional,
  onToggleGroupItem,
  onNotesChange,
  onAddToCart,
}: LateralOptionalsWizardProps) {
  // Build steps: product info, then each group, then old-style optionals (if any), then notes+confirm
  const steps: { type: 'group' | 'oldOptionals' | 'confirm'; group?: OptionalGroup }[] = [];

  groups.forEach((g) => steps.push({ type: 'group', group: g }));

  if (oldStyleOptionals.length > 0) {
    steps.push({ type: 'oldOptionals' });
  }

  steps.push({ type: 'confirm' });

  const [currentStep, setCurrentStep] = useState(0);

  // Reset wizard back to first step whenever the product changes
  // (prevents wizard state from persisting across different products)
  useEffect(() => {
    setCurrentStep(0);
  }, [product.id]);

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  // Validate current step before advancing
  function canAdvance(): boolean {
    if (step.type === 'group' && step.group) {
      const g = step.group;
      const selected = selectedGroupItems[g.id];
      const count = selected ? selected.size : 0;
      if (g.minSelect > 0 && count < g.minSelect) return false;
    }
    return true;
  }

  // Calculate running total
  const groupOptionalsPrices = groups.reduce((sum, g) => {
    const sel = selectedGroupItems[g.id];
    if (!sel) return sum;
    return sum + g.items.filter((i) => sel.has(i.id)).reduce((s, i) => s + i.price, 0);
  }, 0);
  const oldOptionalsPrices = selectedOptionals.reduce((sum, o) => sum + o.price, 0);
  const totalPrice = product.price + groupOptionalsPrices + oldOptionalsPrices;

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="flex gap-1 mb-4">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= currentStep ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 min-h-0">
        {step.type === 'group' && step.group && (
          <div key={step.group.id} className="space-y-3 animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-lg font-bold">{step.group.name}</Label>
              <Badge variant="outline" className="text-xs">
                {step.group.minSelect > 0 ? `mín ${step.group.minSelect} / ` : ''}
                máx {step.group.maxSelect > 0 ? step.group.maxSelect : '∞'}
              </Badge>
              {step.group.minSelect > 0 && (
                <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
              )}
            </div>

            {step.group.layout === 'horizontal' ? (
              <div className="grid grid-cols-3 gap-2">
                {step.group.items.filter((i) => i.active).map((item) => {
                  const isSelected = selectedGroupItems[step.group!.id]?.has(item.id) || false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'relative rounded-xl border-2 overflow-hidden transition-all text-left',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30 shadow-md'
                          : 'border-border hover:border-primary/50'
                      )}
                      onClick={() => onToggleGroupItem(step.group!.id, item.id, step.group!.maxSelect)}
                    >
                      {item.imageUrl ? (
                        <div className="w-full aspect-square overflow-hidden">
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full aspect-square bg-muted flex items-center justify-center">
                          <span className="text-3xl">🍽️</span>
                        </div>
                      )}
                      <div className="p-1.5 space-y-0.5">
                        <p className={cn(
                          'text-[11px] font-semibold line-clamp-2 leading-tight text-center',
                          isSelected ? 'text-primary' : 'text-foreground'
                        )}>
                          {item.name}
                        </p>
                        {item.price > 0 && (
                          <p className="text-[10px] text-green-600 font-medium text-center">
                            +R$ {formatPrice(item.price)}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {step.group.items.filter((i) => i.active).map((item) => {
                  const isSelected = selectedGroupItems[step.group!.id]?.has(item.id) || false;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors',
                        isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                      )}
                      onClick={() => onToggleGroupItem(step.group!.id, item.id, step.group!.maxSelect)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => onToggleGroupItem(step.group!.id, item.id, step.group!.maxSelect)}
                        />
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        )}
                        <span className="font-medium">{item.name}</span>
                      </div>
                      {item.price > 0 && (
                        <span className="text-green-600 font-semibold">+R$ {formatPrice(item.price)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step.type === 'oldOptionals' && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-200">
            <Label className="text-lg font-bold">Adicionais</Label>
            {oldStyleOptionals
              .filter((o) => o.active)
              .map((optional) => (
                <div
                  key={optional.id}
                  className={cn(
                    'flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors',
                    selectedOptionals.some((o) => o.id === optional.id)
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  )}
                  onClick={() => onToggleOptional(optional)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedOptionals.some((o) => o.id === optional.id)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => onToggleOptional(optional)}
                    />
                    <span className="font-medium">{optional.name}</span>
                  </div>
                  {optional.price > 0 && (
                    <span className="text-green-600 font-semibold">+R$ {formatPrice(optional.price)}</span>
                  )}
                </div>
              ))}
          </div>
        )}

        {step.type === 'confirm' && (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
            <div>
              <Label>Observações (opcional)</Label>
              <Input
                value={itemNotes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Ex: Sem cebola, bem passado..."
                className="mt-2"
              />
            </div>

            {/* Summary */}
            <div className="border rounded-lg p-3 space-y-1 bg-muted/30">
              <p className="font-semibold text-sm">{product.name}</p>
              <p className="text-xs text-muted-foreground">R$ {formatPrice(product.price)}</p>
              {groups.map((g) => {
                const sel = selectedGroupItems[g.id];
                if (!sel || sel.size === 0) return null;
                const selectedNames = g.items.filter((i) => sel.has(i.id));
                return (
                  <div key={g.id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{g.name}:</span>{' '}
                    {selectedNames.map((i) => i.name).join(', ')}
                  </div>
                );
              })}
              {selectedOptionals.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  + {selectedOptionals.map((o) => o.name).join(', ')}
                </p>
              )}
              <p className="text-lg font-bold text-green-600 pt-1">Total: R$ {formatPrice(totalPrice)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation - sticky at bottom */}
      <div className="flex gap-2 mt-4 pt-3 border-t flex-shrink-0">
        {!isFirst && (
          <Button
            variant="outline"
            onClick={() => setCurrentStep((s) => s - 1)}
            className="flex-1"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        )}
        {isLast ? (
          <Button onClick={onAddToCart} className="flex-1" size="lg">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Adicionar — R$ {formatPrice(totalPrice)}
          </Button>
        ) : (
          <Button
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="flex-1"
          >
            Próximo
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
