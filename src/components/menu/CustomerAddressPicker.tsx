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
import { Trash2, Plus, Settings, Star } from 'lucide-react';
import { CustomerAddress } from '@/hooks/useCustomerAddresses';

interface CustomerAddressPickerProps {
  addresses: CustomerAddress[];
  selectedId: string | null;
  onSelect: (addr: CustomerAddress) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onSetDefault: (id: string) => Promise<void> | void;
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
}: CustomerAddressPickerProps) {
  const [manageOpen, setManageOpen] = useState(false);

  if (addresses.length === 0) return null;

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
          <SelectTrigger className="h-9 flex-1 min-w-[220px]">
            <SelectValue placeholder="Selecionar endereço salvo" />
          </SelectTrigger>
          <SelectContent>
            {addresses.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {formatAddress(a)}
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
        <DialogContent className="max-w-md">
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
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
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
                      onClick={() => onSetDefault(a.id)}
                      className="h-7 px-2 text-xs"
                    >
                      Tornar padrão
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(a.id)}
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