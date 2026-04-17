import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2 } from 'lucide-react';

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  company_id: string | null;
  company_name: string;
  type: string;
  value: number;
  days_counted: number | null;
}

export interface InvoiceForEdit {
  id: string;
  reseller_id: string;
  month: string;
  due_date: string;
  total_value: number;
  status: string;
}

interface Props {
  invoice: InvoiceForEdit | null;
  items: InvoiceItemRow[];
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS = [
  { value: 'monthly', label: 'Mensalidade' },
  { value: 'prorated', label: 'Proporcional' },
  { value: 'activation', label: 'Taxa de Ativação' },
  { value: 'discount', label: 'Desconto' },
  { value: 'adjustment', label: 'Ajuste manual' },
];

interface DraftItem {
  id?: string;
  isNew?: boolean;
  toDelete?: boolean;
  company_id: string | null;
  company_name: string;
  type: string;
  value: number;
  days_counted: number | null;
}

export function InvoiceEditDialog({ invoice, items, onClose, onSaved }: Props) {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [overrideTotal, setOverrideTotal] = useState(false);
  const [totalValue, setTotalValue] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [status, setStatus] = useState<string>('pending');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setDrafts(items.map(i => ({
      id: i.id,
      company_id: i.company_id,
      company_name: i.company_name,
      type: i.type,
      value: Number(i.value),
      days_counted: i.days_counted,
    })));
    setOverrideTotal(false);
    setTotalValue(String(Number(invoice.total_value).toFixed(2)));
    setDueDate(invoice.due_date);
    setStatus(invoice.status);
  }, [invoice, items]);

  const visibleDrafts = drafts.filter(d => !d.toDelete);
  const computedTotal = visibleDrafts.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const effectiveTotal = overrideTotal ? Number(totalValue) || 0 : computedTotal;

  function updateDraft(idx: number, patch: Partial<DraftItem>) {
    setDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function addDraft() {
    setDrafts(prev => [...prev, {
      isNew: true,
      company_id: null,
      company_name: '',
      type: 'adjustment',
      value: 0,
      days_counted: null,
    }]);
  }

  function removeDraft(idx: number) {
    setDrafts(prev => {
      const target = prev[idx];
      if (target.isNew) return prev.filter((_, i) => i !== idx);
      return prev.map((d, i) => (i === idx ? { ...d, toDelete: true } : d));
    });
  }

  async function handleSave() {
    if (!invoice) return;

    // Validate visible drafts
    for (const d of visibleDrafts) {
      if (!d.company_name.trim()) {
        toast.error('Cada item precisa de uma descrição (nome da loja ou ajuste).');
        return;
      }
      if (Number.isNaN(Number(d.value))) {
        toast.error('Valor inválido em algum item.');
        return;
      }
    }

    setSaving(true);
    try {
      // Deletions
      const idsToDelete = drafts.filter(d => d.toDelete && d.id).map(d => d.id!);
      if (idsToDelete.length) {
        const { error } = await supabase
          .from('reseller_invoice_items')
          .delete()
          .in('id', idsToDelete);
        if (error) throw error;
      }

      // Updates
      for (const d of drafts) {
        if (d.toDelete || d.isNew || !d.id) continue;
        const { error } = await supabase
          .from('reseller_invoice_items')
          .update({
            company_name: d.company_name.trim(),
            type: d.type,
            value: Number(d.value),
            days_counted: d.days_counted,
          })
          .eq('id', d.id);
        if (error) throw error;
      }

      // Inserts
      const inserts = drafts
        .filter(d => d.isNew && !d.toDelete)
        .map(d => ({
          invoice_id: invoice.id,
          company_id: d.company_id,
          company_name: d.company_name.trim(),
          type: d.type,
          value: Number(d.value),
          days_counted: d.days_counted,
        }));
      if (inserts.length) {
        const { error } = await supabase.from('reseller_invoice_items').insert(inserts);
        if (error) throw error;
      }

      // Invoice header
      const { error: invErr } = await supabase
        .from('reseller_invoices')
        .update({
          total_value: effectiveTotal,
          due_date: dueDate,
          status,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', invoice.id);
      if (invErr) throw invErr;

      toast.success('Fatura atualizada!');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving invoice:', err);
      toast.error(`Erro ao salvar: ${err.message || 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar fatura</DialogTitle>
          <DialogDescription>
            Edite valores, dias, descrições, adicione ou remova itens. O total recalcula automaticamente
            (use o ajuste manual se precisar substituir o total).
          </DialogDescription>
        </DialogHeader>

        {/* Invoice header */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Vencimento</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Itens da fatura</Label>
            <Button type="button" variant="outline" size="sm" onClick={addDraft} className="gap-1">
              <Plus className="w-3 h-3" /> Adicionar item
            </Button>
          </div>

          {visibleDrafts.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhum item — adicione pelo menos um.</p>
          )}

          {drafts.map((d, idx) => {
            if (d.toDelete) return null;
            return (
              <div key={d.id || `new-${idx}`} className="grid grid-cols-[1fr_140px_100px_110px_auto] gap-2 items-end p-3 rounded-md border bg-muted/30">
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    value={d.company_name}
                    onChange={e => updateDraft(idx, { company_name: e.target.value })}
                    placeholder="Nome da loja ou ajuste"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={d.type} onValueChange={v => updateDraft(idx, { type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dias</Label>
                  <Input
                    type="number"
                    value={d.days_counted ?? ''}
                    onChange={e => updateDraft(idx, { days_counted: e.target.value ? Number(e.target.value) : null })}
                    placeholder="—"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={d.value}
                    onChange={e => updateDraft(idx, { value: Number(e.target.value) })}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeDraft(idx)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Total */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Soma dos itens</span>
            <span className="font-medium">
              R$ {computedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={overrideTotal} onCheckedChange={setOverrideTotal} id="override-total" />
              <Label htmlFor="override-total" className="text-sm cursor-pointer">
                Substituir total manualmente
              </Label>
            </div>
            <Input
              type="number"
              step="0.01"
              value={totalValue}
              onChange={e => setTotalValue(e.target.value)}
              disabled={!overrideTotal}
              className="w-40 text-right"
            />
          </div>

          <div className="flex items-center justify-between bg-primary/10 rounded-md px-3 py-2">
            <span className="font-semibold">Total da fatura</span>
            <span className="text-lg font-bold text-primary">
              R$ {effectiveTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
