import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { brl as formatPrice } from './_format';
import type { TabItem } from '@/hooks/useTabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Mode = 'choose' | 'select_items' | 'split_people';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tabItems: TabItem[];
  tabTotal: number;
  tabLabel: string;
  /** Called to open the payment dialog with calculated total and selected item ids */
  onPayPartial: (selectedItemIds: string[], total: number) => void;
  /** Called for split-by-people: opens payment dialog with per-person amount */
  onPaySplit: (perPersonAmount: number, remainingPeople: number, totalPeople: number) => void;
}

export function PDVV2TabImportDialog({
  open,
  onOpenChange,
  tabItems,
  tabTotal,
  tabLabel,
  onPayPartial,
  onPaySplit,
}: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [numPeople, setNumPeople] = useState('2');

  // Reset state when dialog opens/closes
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setMode('choose');
      setSelectedIds(new Set());
      setNumPeople('2');
    }
    onOpenChange(o);
  };

  const unpaidItems = useMemo(() => tabItems.filter((i) => !i.paid), [tabItems]);
  const paidItems = useMemo(() => tabItems.filter((i) => i.paid), [tabItems]);

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const item of unpaidItems) {
      if (selectedIds.has(item.id)) sum += item.total_price;
    }
    return sum;
  }, [unpaidItems, selectedIds]);

  const peopleCount = parseInt(numPeople) || 0;
  const unpaidTotal = unpaidItems.reduce((s, i) => s + i.total_price, 0);
  const perPerson = peopleCount > 0 ? unpaidTotal / peopleCount : 0;

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(unpaidItems.map((i) => i.id)));
  }

  if (mode === 'choose') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tabLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border p-3 bg-muted/40 text-center">
              <p className="text-sm text-muted-foreground">Total da comanda</p>
              <p className="text-2xl font-bold tabular-nums">{formatPrice(tabTotal)}</p>
              {paidItems.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Restante: {formatPrice(unpaidTotal)} ({paidItems.length} item(ns) já pago(s))
                </p>
              )}
            </div>
            <Button className="w-full" size="lg" onClick={() => setMode('select_items')}>
              Cobrar itens selecionados
            </Button>
            <Button className="w-full" size="lg" variant="outline" onClick={() => setMode('split_people')}>
              Dividir conta pelo número de pessoas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === 'select_items') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar itens para cobrar</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} de {unpaidItems.length} selecionado(s)
              </span>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Selecionar todos
              </Button>
            </div>

            {paidItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-600">Já pagos:</p>
                {paidItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 border rounded-md bg-green-50 dark:bg-green-950/30 opacity-60">
                    <span className="flex-1 text-sm line-through">
                      {item.quantity}x {item.product_name}
                    </span>
                    <span className="text-sm tabular-nums text-green-600">{formatPrice(item.total_price)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              {unpaidItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Todos os itens já foram pagos.</p>
              ) : (
                unpaidItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-accent/30"
                  >
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleItem(item.id)}
                    />
                    <span className="flex-1 text-sm">
                      {item.quantity}x {item.product_name}
                      {item.notes && <span className="text-xs text-muted-foreground ml-1">({item.notes})</span>}
                    </span>
                    <span className="text-sm tabular-nums font-medium">{formatPrice(item.total_price)}</span>
                  </label>
                ))
              )}
            </div>

            <div className="rounded-md border p-3 bg-muted/40 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total selecionado</span>
              <span className="text-xl font-bold tabular-nums">{formatPrice(selectedTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMode('choose')}>Voltar</Button>
            <Button
              disabled={selectedIds.size === 0}
              onClick={() => onPayPartial(Array.from(selectedIds), selectedTotal)}
            >
              Cobrar {formatPrice(selectedTotal)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // mode === 'split_people'
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Dividir conta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 bg-muted/40 text-center">
            <p className="text-sm text-muted-foreground">Total restante</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(unpaidTotal)}</p>
          </div>

          <div className="space-y-2">
            <Label>Número de pessoas</Label>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              value={numPeople}
              onChange={(e) => setNumPeople(e.target.value)}
              autoFocus
            />
          </div>

          {peopleCount > 0 && (
            <div className="rounded-md border p-3 bg-muted/40 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor por pessoa</span>
              <span className="text-xl font-bold tabular-nums">{formatPrice(perPerson)}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setMode('choose')}>Voltar</Button>
          <Button
            disabled={peopleCount < 1}
            onClick={() => onPaySplit(perPerson, peopleCount, peopleCount)}
          >
            Cobrar {formatPrice(perPerson)} por pessoa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}