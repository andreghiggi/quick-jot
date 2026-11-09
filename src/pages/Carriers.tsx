import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Truck } from 'lucide-react';
import { formatCpfCnpj, formatCep, lookupCep, onlyDigits } from '@/lib/fiscalPerson';

export interface Carrier {
  id: string; company_id: string; name: string; document: string | null; state_registration: string | null;
  phone: string | null; zip_code: string | null; address: string | null; number: string | null;
  neighborhood: string | null; city: string | null; state: string | null; ibge_code: string | null;
  vehicle_plate: string | null; vehicle_state: string | null; rntc: string | null; notes: string | null; active: boolean;
}

const empty = {
  name: '', document: '', state_registration: '', phone: '', zip_code: '', address: '', number: '',
  neighborhood: '', city: '', state: '', ibge_code: '', vehicle_plate: '', vehicle_state: '', rntc: '', notes: '', active: true,
};
type Form = typeof empty;

export default function Carriers() {
  const { company } = useAuthContext();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [toDelete, setToDelete] = useState<Carrier | null>(null);

  const { data: carriers = [], isLoading } = useQuery({
    queryKey: ['carriers', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await (supabase as any).from('carriers').select('*')
        .eq('company_id', company.id).order('name');
      if (error) throw error;
      return (data || []) as Carrier[];
    },
    enabled: !!company?.id,
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return carriers;
    return carriers.filter(c => c.name.toLowerCase().includes(s) || (c.document || '').includes(s) || (c.vehicle_plate || '').toLowerCase().includes(s));
  }, [carriers, search]);

  const set = (k: keyof Form, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function onCep(v: string) {
    set('zip_code', formatCep(v));
    if (onlyDigits(v).length === 8) {
      const r = await lookupCep(v);
      if (!r) { toast.error('CEP não encontrado'); return; }
      setForm(f => ({ ...f, address: r.logradouro || f.address, neighborhood: r.bairro || f.neighborhood, city: r.cidade, state: r.uf, ibge_code: r.ibge }));
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error('Empresa não encontrada');
      if (!form.name.trim()) throw new Error('Razão social é obrigatória');
      const payload: any = { company_id: company.id, active: form.active };
      (Object.keys(empty) as (keyof Form)[]).forEach(k => {
        if (k !== 'active') payload[k] = String(form[k] ?? '').trim() || null;
      });
      payload.name = form.name.trim();
      const q = (supabase as any).from('carriers');
      const { error } = editing ? await q.update(payload).eq('id', editing.id) : await q.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['carriers'] }); toast.success(editing ? 'Transportador atualizado' : 'Transportador cadastrado'); setOpen(false); },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar'),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from('carriers').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['carriers'] }); toast.success('Transportador excluído'); setToDelete(null); },
    onError: (e: any) => toast.error(e.message || 'Erro ao excluir'),
  });

  const openEdit = (c: Carrier) => {
    setEditing(c);
    const f: any = { ...empty };
    (Object.keys(empty) as (keyof Form)[]).forEach(k => { f[k] = k === 'active' ? c.active : ((c as any)[k] || ''); });
    setForm(f); setOpen(true);
  };

  const field = (k: keyof Form, label: string, cls = '', extra: any = {}) => (
    <div className={cls}><Label>{label}</Label><Input value={form[k] as string} onChange={e => set(k, e.target.value)} {...extra} /></div>
  );

  return (
    <AppLayout title="Transportadores" subtitle="Cadastro de transportadores">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5 text-primary" />Transportadores ({filtered.length})</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar nome, CNPJ, placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-full sm:w-72" />
            </div>
            <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Novo transportador</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground">Nenhum transportador {search ? 'encontrado' : 'cadastrado'}.</div>
          : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Razão social</TableHead><TableHead>CNPJ/CPF</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Placa</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.document ? formatCpfCnpj(c.document) : '—'}</TableCell>
                      <TableCell>{[c.city, c.state].filter(Boolean).join('/') || '—'}</TableCell>
                      <TableCell>{c.vehicle_plate || '—'}</TableCell>
                      <TableCell>{c.active ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(c)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar transportador' : 'Novo transportador'}</DialogTitle>
            <DialogDescription>Dados usados na aba Transporte da NF-e.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {field('name', 'Razão social / Nome *', 'sm:col-span-4')}
            <div className="sm:col-span-2"><Label>CNPJ / CPF</Label><Input value={form.document} onChange={e => set('document', formatCpfCnpj(e.target.value))} /></div>
            {field('state_registration', 'Inscrição estadual')}
            {field('phone', 'Telefone')}
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={e => onCep(e.target.value)} placeholder="00000-000" /></div>
            {field('address', 'Logradouro', 'sm:col-span-2')}
            {field('number', 'Número')}
            {field('neighborhood', 'Bairro', 'sm:col-span-2')}
            {field('city', 'Município')}
            <div><Label>UF</Label><Input maxLength={2} value={form.state} onChange={e => set('state', e.target.value.toUpperCase())} /></div>
            {field('ibge_code', 'Código IBGE', '', { maxLength: 7 })}
            <div><Label>Placa</Label><Input value={form.vehicle_plate} onChange={e => set('vehicle_plate', e.target.value.toUpperCase())} /></div>
            <div><Label>UF da placa</Label><Input maxLength={2} value={form.vehicle_state} onChange={e => set('vehicle_state', e.target.value.toUpperCase())} /></div>
            {field('rntc', 'RNTC')}
            <div className="sm:col-span-4"><Label>Observações</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            <div className="flex items-center gap-2 sm:col-span-4"><Switch checked={form.active} onCheckedChange={v => set('active', v)} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transportador?</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir <strong>{toDelete?.name}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && del.mutate(toDelete.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
