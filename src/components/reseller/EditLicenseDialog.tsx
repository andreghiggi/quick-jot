import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

const DUE_DAY_OPTIONS = [5, 10, 15, 20, 25];

interface Props {
  open: boolean;
  onClose: () => void;
  store: {
    id: string;
    name: string;
    cnpj?: string | null;
    phone?: string | null;
    login_email?: string | null;
    address_street?: string | null;
    address_number?: string | null;
    address_neighborhood?: string | null;
    next_invoice_due_day?: number | null;
  } | null;
  onSaved: () => void;
}

export function EditLicenseDialog({ open, onClose, store, onSaved }: Props) {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [dueDay, setDueDay] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && store) {
      setName(store.name || '');
      setCnpj(store.cnpj || '');
      setPhone(store.phone || '');
      setEmail(store.login_email || '');
      setStreet(store.address_street || '');
      setNumber(store.address_number || '');
      setNeighborhood(store.address_neighborhood || '');
      setDueDay(store.next_invoice_due_day ? String(store.next_invoice_due_day) : '');
    }
  }, [open, store?.id]);

  async function handleSave() {
    if (!store) return;
    if (!name.trim()) {
      toast.error('Nome da loja é obrigatório');
      return;
    }
    const dueDayNum = dueDay ? Number(dueDay) : null;
    if (dueDayNum !== null && !DUE_DAY_OPTIONS.includes(dueDayNum)) {
      toast.error('Dia de vencimento inválido');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: name.trim(),
        cnpj: cnpj.trim() || null,
        phone: phone.trim() || null,
        login_email: email.trim() || null,
        address_street: street.trim() || null,
        address_number: number.trim() || null,
        address_neighborhood: neighborhood.trim() || null,
        next_invoice_due_day: dueDayNum,
      })
      .eq('id', store.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Licença atualizada');
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar licença</DialogTitle>
          <DialogDescription>
            Edite os dados cadastrais da loja e o dia de vencimento das próximas faturas.
            Faturas já geradas não são alteradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-name">Nome da loja *</Label>
            <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-cnpj">CNPJ</Label>
              <Input id="ed-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-phone">Telefone</Label>
              <Input id="ed-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-email">E-mail</Label>
            <Input id="ed-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ed-street">Rua</Label>
              <Input id="ed-street" value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-number">Número</Label>
              <Input id="ed-number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-neigh">Bairro</Label>
            <Input id="ed-neigh" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
            <Label htmlFor="ed-dueday">Dia de vencimento das próximas faturas</Label>
            <Input
              id="ed-dueday"
              type="number"
              min={1}
              max={28}
              placeholder="Ex: 10"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Aplicado apenas às faturas geradas a partir de agora. Faturas já existentes mantêm a data atual.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
