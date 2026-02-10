import { useState } from 'react';
import { Product } from '@/types/product';
import { TaxRule } from '@/hooks/useTaxRules';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

interface BulkTaxRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  taxRules: TaxRule[];
  onApply: (productIds: string[], taxRuleId: string | null) => Promise<boolean>;
}

export function BulkTaxRuleDialog({ open, onOpenChange, products, taxRules, onApply }: BulkTaxRuleDialogProps) {
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedTaxRuleId, setSelectedTaxRuleId] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  function toggleProduct(id: string) {
    const next = new Set(selectedProducts);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedProducts(next);
  }

  function selectAll() {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  }

  async function handleApply() {
    if (selectedProducts.size === 0) return;
    setIsApplying(true);
    const taxRuleId = selectedTaxRuleId === '_none' ? null : selectedTaxRuleId || null;
    const success = await onApply(Array.from(selectedProducts), taxRuleId);
    setIsApplying(false);
    if (success) {
      setSelectedProducts(new Set());
      setSelectedTaxRuleId('');
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Atribuir Regra Tributária em Massa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Regra Tributária</Label>
            <Select value={selectedTaxRuleId} onValueChange={setSelectedTaxRuleId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a regra tributária" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhuma (remover regra)</SelectItem>
                {taxRules.filter(r => r.active).map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name} (CFOP: {rule.cfop})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Selecione os produtos ({selectedProducts.size} selecionados)</Label>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {selectedProducts.size === products.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
            </div>
            <ScrollArea className="h-[300px] border rounded-md p-2">
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleProduct(product.id)}
                  >
                    <Checkbox
                      checked={selectedProducts.has(product.id)}
                      onCheckedChange={() => toggleProduct(product.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.category} - R$ {product.price.toFixed(2)}</p>
                    </div>
                    {!product.active && (
                      <Badge variant="secondary" className="text-xs">Inativo</Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Button
            onClick={handleApply}
            disabled={selectedProducts.size === 0 || !selectedTaxRuleId || isApplying}
            className="w-full"
          >
            {isApplying ? 'Aplicando...' : `Aplicar em ${selectedProducts.size} produto(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
