import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Plus, Settings, Star, Pencil } from 'lucide-react';
import { CustomerAddress, NewAddressInput } from '@/hooks/useCustomerAddresses';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AddressCepInput } from './AddressCepInput';
import { AddressLabelInput } from './AddressLabelInput';
import { AddressNeighborhoodInput } from './AddressNeighborhoodInput';
import { toast } from 'sonner';

interface CustomerAddressPickerProps {
  addresses: CustomerAddress[];
  selectedId: string | null;
  onSelect: (addr: CustomerAddress) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onSetDefault: (id: string) => Promise<void> | void;
  onUpdate?: (id: string, input: NewAddressInput) => Promise<CustomerAddress | void>;
  neighborhoodNames?: string[];
}

function formatAddress(a: CustomerAddress): string {
  const parts: string[] = [];
  if (a.address) {
    parts.push(a.number ? `${a.address}, ${a.number}` : a.address);
  }
  if (a.neighborhood) parts.push(a.neighborhood);
  const main = parts.join(' - ');
  return a.label ? `${a.label} — ${main || 'Endereço'}` : (main || 'Endereço');
}

export function CustomerAddressPicker({
  addresses,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  onSetDefault,
  onUpdate,
  neighborhoodNames = [],
}: CustomerAddressPickerProps) {
  const [manageOpen, setManageOpen] = useState(false);

  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const perform = async (action: () => Promise<void> | void) => {
    setBusy(true);
    try { await action(); } catch { toast.error('Não foi possível salvar a alteração do endereço.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Endereços salvos ({addresses.length})
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedId ?? ''}
          onValueChange={(value) => {
            const found = addresses.find((a) => a.id === value);
            if (found) onSelect(found);
          }}
        >
          <SelectTrigger className="h-9 flex-1 min-w-0 w-full">
            <SelectValue placeholder="Selecionar endereço salvo" />
          </SelectTrigger>
          <SelectContent>
            {addresses.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.is_default ? '★ ' : ''}{formatAddress(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNew}
          className="gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Novo
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setManageOpen(true)}
          className="gap-1"
        >
          <Settings className="w-3.5 h-3.5" /> Gerenciar
        </Button>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Gerenciar endereços</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {addresses.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-2 rounded-md border p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {a.label || 'Endereço'}
                    </p>
                    {a.is_default && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                        <Star className="w-3 h-3 fill-current" /> Padrão
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground break-words">
                    {[
                      a.address && (a.number ? `${a.address}, ${a.number}` : a.address),
                      a.complement,
                      a.neighborhood,
                      a.reference ? `Ref: ${a.reference}` : null,
                    ]
                      .filter(Boolean)
                      .join(' - ')}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {!a.is_default && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy} onClick={() => perform(() => onSetDefault(a.id))}
                      className="h-7 px-2 text-xs"
                    >
                      Tornar padrão
                    </Button>
                  )}
                  {onUpdate && <Button type="button" size="icon" variant="ghost" aria-label="Editar endereço" title="Editar endereço" disabled={busy} onClick={() => setEditing({ ...a })}><Pencil className="w-3.5 h-3.5" /></Button>}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Excluir endereço" title="Excluir endereço"
                    disabled={busy}
                    onClick={() => setDeleteId(a.id)}
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {addresses.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum endereço salvo.
              </p>
            )}
          </div>
          {deleteId && <div className="space-y-2 border-t pt-3"><p className="text-sm">Excluir este endereço salvo?</p><div className="flex gap-2"><Button variant="destructive" disabled={busy} onClick={() => perform(async () => { await onDelete(deleteId); setDeleteId(null); })}>Excluir</Button><Button variant="outline" disabled={busy} onClick={() => setDeleteId(null)}>Cancelar</Button></div></div>}
          {editing && <div className="space-y-3 border-t pt-3">
            <AddressCepInput key={editing.id} neighborhoodNames={neighborhoodNames} onFound={a => setEditing(current => current ? { ...current, ...(a.address ? { address: a.address } : {}), neighborhood: a.neighborhood } : null)} />
            <AddressLabelInput value={editing.label ?? ''} onChange={label => setEditing({ ...editing, label })} />
            {([['address', 'Rua'], ['number', 'Número'], ['complement', 'Complemento']] as const).map(([field, label]) => <div key={field}><Label>{label}</Label><Input aria-label={label} className="text-base md:text-sm" value={editing[field] ?? ''} onChange={e => setEditing({ ...editing, [field]: e.target.value })} /></div>)}
            <div><Label>Bairro *</Label><AddressNeighborhoodInput names={neighborhoodNames} value={editing.neighborhood ?? ''} onChange={neighborhood => setEditing({ ...editing, neighborhood })} /></div>
            <div><Label>Referência</Label><Textarea aria-label="Referência" value={editing.reference ?? ''} onChange={e => setEditing({ ...editing, reference: e.target.value })} /></div>
            <div className="flex gap-2"><Button disabled={busy || !editing.address?.trim() || !editing.number?.trim() || !editing.neighborhood?.trim()} onClick={() => perform(async () => { if (!onUpdate) return; const { id, customer_id, company_id, created_at, updated_at, ...input } = editing; const saved = await onUpdate(id, input); if (saved && selectedId === id) onSelect(saved); setEditing(null); })}>Salvar endereço</Button><Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button></div>
          </div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}