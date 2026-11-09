import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { formatCpfCnpj, formatCep, lookupCep, onlyDigits, IND_IE_OPTIONS, validateIndIE } from '@/lib/fiscalPerson';

interface Customer {
  id: string;
  company_id: string | null;
  name: string;
  phone: string;
  cpf: string | null;
  birth_date: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  ibge_code: string | null;
  person_type: string | null;
  ie: string | null;
  ind_ie_dest: string | null;
  email: string | null;
  created_at: string;
}

const empty = {
  name: '', phone: '', email: '', cpf: '', birth_date: '', person_type: 'PF', ie: '', ind_ie_dest: '9',
  cep: '', address: '', number: '', complement: '', neighborhood: '', city: '', state: '', ibge_code: '',
};
type Form = typeof empty;

export default function Customers() {
  const { company } = useAuthContext();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers-crud', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('customers').select('*')
        .eq('company_id', company.id).order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Customer[];
    },
    enabled: !!company?.id,
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return customers;
    const sd = onlyDigits(s);
    return customers.filter(c =>
      c.name.toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s) ||
      (sd && onlyDigits(c.cpf).includes(sd))
    );
  }, [customers, search]);

  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function onCep(v: string) {
    set('cep', formatCep(v));
    if (onlyDigits(v).length !== 8) return;
    setCepLoading(true);
    const r = await lookupCep(v);
    setCepLoading(false);
    if (!r) { toast.error('CEP não encontrado'); return; }
    setForm(f => ({ ...f, address: r.logradouro || f.address, neighborhood: r.bairro || f.neighborhood, city: r.cidade, state: r.uf, ibge_code: r.ibge }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error('Empresa não encontrada');
      if (!form.name.trim()) throw new Error('Nome é obrigatório');
      if (!form.phone.trim()) throw new Error('Telefone é obrigatório');
      const doc = onlyDigits(form.cpf);
      if (doc && doc.length !== (form.person_type === 'PJ' ? 14 : 11))
        throw new Error(form.person_type === 'PJ' ? 'CNPJ deve ter 14 dígitos' : 'CPF deve ter 11 dígitos');
      const ieErr = validateIndIE(form.ind_ie_dest, form.ie);
      if (ieErr) throw new Error(ieErr);
      const t = (v: string) => v.trim() || null;
      const payload: any = {
        company_id: company.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: t(form.email),
        cpf: doc ? formatCpfCnpj(doc) : null,
        birth_date: form.birth_date || null,
        person_type: form.person_type,
        ie: form.ind_ie_dest === '1' ? t(form.ie) : (form.ind_ie_dest === '2' ? 'ISENTO' : null),
        ind_ie_dest: form.ind_ie_dest,
        cep: t(form.cep),
        address: t(form.address),
        number: t(form.number),
        complement: t(form.complement),
        neighborhood: t(form.neighborhood),
        city: t(form.city),
        state: t(form.state),
        ibge_code: t(form.ibge_code),
      };
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers-crud'] });
      toast.success(editing ? 'Cliente atualizado' : 'Cliente cadastrado');
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers-crud'] });
      toast.success('Cliente excluído');
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao excluir'),
  });

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    const docLen = onlyDigits(c.cpf).length;
    setForm({
      name: c.name || '', phone: c.phone || '', email: c.email || '', cpf: c.cpf || '', birth_date: c.birth_date || '',
      person_type: c.person_type || (docLen === 14 ? 'PJ' : 'PF'),
      ie: c.ie && c.ie !== 'ISENTO' ? c.ie : '', ind_ie_dest: c.ind_ie_dest || '9',
      cep: c.cep || '', address: c.address || '', number: c.number || '', complement: c.complement || '',
      neighborhood: c.neighborhood || '', city: c.city || '', state: c.state || '', ibge_code: c.ibge_code || '',
    });
    setOpen(true);
  };

  const field = (k: keyof Form, label: string, cls = '', extra: any = {}) => (
    <div className={cls}><Label>{label}</Label><Input value={form[k]} onChange={e => set(k, e.target.value)} {...extra} /></div>
  );

  return (
    <AppLayout title="Clientes" subtitle="Cadastro de clientes">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Clientes ({filtered.length})
          </CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar nome, telefone ou CPF/CNPJ" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-64" />
            </div>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo cliente</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum cliente {search ? 'encontrado' : 'cadastrado'}.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{c.cpf || '—'}</TableCell>
                      <TableCell>{[c.city, c.state].filter(Boolean).join('/') || '—'}</TableCell>
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
            <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            <DialogDescription>Dados do cliente da loja.</DialogDescription>
          </DialogHeader>

          <p className="text-sm font-semibold text-muted-foreground">Dados gerais</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {field('name', form.person_type === 'PJ' ? 'Razão social *' : 'Nome *', 'sm:col-span-4')}
            <div>
              <Label>Tipo</Label>
              <Select value={form.person_type} onValueChange={v => setForm(f => ({ ...f, person_type: v, cpf: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa física</SelectItem>
                  <SelectItem value="PJ">Pessoa jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.person_type === 'PJ' ? 'CNPJ' : 'CPF'}</Label>
              <Input value={form.cpf} onChange={e => set('cpf', formatCpfCnpj(onlyDigits(e.target.value).slice(0, form.person_type === 'PJ' ? 14 : 11)))} />
            </div>
            {field('phone', 'Telefone *')}
            {form.person_type === 'PF'
              ? field('birth_date', 'Data de nascimento', '', { type: 'date' })
              : field('email', 'E-mail', '', { type: 'email' })}
            <div className="sm:col-span-2">
              <Label>Indicador de inscrição estadual</Label>
              <Select value={form.ind_ie_dest} onValueChange={v => set('ind_ie_dest', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IND_IE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {field('ie', form.ind_ie_dest === '1' ? 'Inscrição estadual *' : 'Inscrição estadual', 'sm:col-span-2', { disabled: form.ind_ie_dest !== '1' })}
            {form.person_type === 'PF' && field('email', 'E-mail', 'sm:col-span-4', { type: 'email' })}
          </div>

          <p className="text-sm font-semibold text-muted-foreground mt-2">Endereço</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label>CEP {cepLoading && <span className="text-xs text-muted-foreground">buscando…</span>}</Label>
              <Input value={form.cep} onChange={e => onCep(e.target.value)} placeholder="00000-000" />
            </div>
            {field('address', 'Logradouro', 'sm:col-span-2')}
            {field('number', 'Número')}
            {field('complement', 'Complemento', 'sm:col-span-2')}
            {field('neighborhood', 'Bairro', 'sm:col-span-2')}
            {field('city', 'Cidade', 'sm:col-span-2')}
            <div><Label>UF</Label><Input maxLength={2} value={form.state} onChange={e => set('state', e.target.value.toUpperCase())} /></div>
            {field('ibge_code', 'Código IBGE', '', { maxLength: 7 })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{toDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
