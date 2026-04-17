import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useResellers, ResellerFormData } from '@/hooks/useResellers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Loader2, Search, Play, Pause, Pencil, Eye, KeyRound, Link2,
  Users, DollarSign, UserCheck, ChevronDown, ChevronRight, Building2, Settings,
} from 'lucide-react';
import { AssignCompaniesDialog } from '@/components/admin/AssignCompaniesDialog';
import { CompanyModulesDialog } from '@/components/admin/CompanyModulesDialog';
import { StoreDetailDialog, StoreDetail } from '@/components/reseller/StoreDetailDialog';

// ── Masks ──

function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function maskCEP(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  // Validate check digits
  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weight[i];
  let remainder = sum % 11;
  const d1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== d1) return false;
  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weight[i];
  remainder = sum % 11;
  const d2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(digits[13]) === d2;
}

function validateFullName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && parts.every(p => p.length >= 2);
}

const UF_OPTIONS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

// ── Component ──

export default function ResellersPage() {
  const { user, impersonateReseller, impersonateCompany } = useAuthContext();
  const navigate = useNavigate();
  const { resellers, loading, createReseller, updateReseller, toggleResellerStatus, refetch } = useResellers();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingReseller, setEditingReseller] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Access creation for existing reseller
  const [accessReseller, setAccessReseller] = useState<{ id: string; email: string; name: string } | null>(null);
  const [accessPassword, setAccessPassword] = useState('');
  const [isCreatingAccess, setIsCreatingAccess] = useState(false);

  // Assign companies dialog
  const [assignReseller, setAssignReseller] = useState<{ id: string; name: string } | null>(null);

  // Expanded resellers (drill-down lojas)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [companiesByReseller, setCompaniesByReseller] = useState<Record<string, any[]>>({});
  const [loadingCompanies, setLoadingCompanies] = useState<Set<string>>(new Set());
  const [modulesCompany, setModulesCompany] = useState<{ id: string; name: string } | null>(null);
  const [selectedStore, setSelectedStore] = useState<StoreDetail | null>(null);

  async function toggleExpand(resellerId: string) {
    const next = new Set(expanded);
    if (next.has(resellerId)) {
      next.delete(resellerId);
      setExpanded(next);
      return;
    }
    next.add(resellerId);
    setExpanded(next);
    if (!companiesByReseller[resellerId]) {
      setLoadingCompanies(prev => new Set(prev).add(resellerId));
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('reseller_id', resellerId)
        .order('created_at', { ascending: false });
      setCompaniesByReseller(prev => ({ ...prev, [resellerId]: data || [] }));
      setLoadingCompanies(prev => {
        const n = new Set(prev);
        n.delete(resellerId);
        return n;
      });
    }
  }

  async function handleAccessCompany(companyId: string) {
    const ok = await impersonateCompany(companyId);
    if (ok) navigate('/');
  }

  // Form state
  const [form, setForm] = useState({
    name: '', cnpj: '', email: '', phone: '',
    address_street: '', address_number: '', address_neighborhood: '',
    address_city: '', address_state: '', address_cep: '',
    responsible_name: '', responsible_email: '', responsible_phone: '',
    due_day: '10', activation_fee: '180.00', monthly_fee: '29.90',
    login_password: '',
  });

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  function resetForm() {
    setForm({
      name: '', cnpj: '', email: '', phone: '',
      address_street: '', address_number: '', address_neighborhood: '',
      address_city: '', address_state: '', address_cep: '',
      responsible_name: '', responsible_email: '', responsible_phone: '',
      due_day: '10', activation_fee: '180.00', monthly_fee: '29.90',
      login_password: '',
    });
    setErrors({});
  }

  function openEdit(resellerId: string) {
    const r = resellers.find(x => x.id === resellerId);
    if (!r) return;
    setForm({
      name: r.name || '',
      cnpj: r.cnpj ? maskCNPJ(r.cnpj) : '',
      email: r.email || '',
      phone: r.phone ? maskPhone(r.phone) : '',
      address_street: r.address_street || '',
      address_number: r.address_number || '',
      address_neighborhood: r.address_neighborhood || '',
      address_city: r.address_city || '',
      address_state: r.address_state || '',
      address_cep: r.address_cep ? maskCEP(r.address_cep) : '',
      responsible_name: r.responsible_name || '',
      responsible_email: r.responsible_email || '',
      responsible_phone: r.responsible_phone ? maskPhone(r.responsible_phone) : '',
      due_day: String(r.settings?.invoice_due_day || 10),
      activation_fee: String(r.settings?.activation_fee || 180),
      monthly_fee: String(r.settings?.monthly_fee || 29.90),
      login_password: '',
    });
    setEditingReseller(resellerId);
    setErrors({});
    setIsEditOpen(true);
  }

  function validate(isCreate: boolean): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Razão Social é obrigatória';
    const cnpjDigits = form.cnpj.replace(/\D/g, '');
    if (!cnpjDigits) e.cnpj = 'CNPJ é obrigatório';
    else if (!validateCNPJ(cnpjDigits)) e.cnpj = 'CNPJ inválido';
    if (!form.email.trim()) e.email = 'E-mail é obrigatório';
    if (!form.phone.replace(/\D/g, '')) e.phone = 'Telefone é obrigatório';
    if (!form.address_street.trim()) e.address_street = 'Rua é obrigatória';
    if (!form.address_number.trim()) e.address_number = 'Número é obrigatório';
    if (!form.address_neighborhood.trim()) e.address_neighborhood = 'Bairro é obrigatório';
    if (!form.address_city.trim()) e.address_city = 'Cidade é obrigatória';
    if (!form.address_state) e.address_state = 'Estado é obrigatório';
    if (form.address_cep.replace(/\D/g, '').length < 8) e.address_cep = 'CEP inválido';
    if (!form.responsible_name.trim()) e.responsible_name = 'Nome do responsável é obrigatório';
    else if (!validateFullName(form.responsible_name)) e.responsible_name = 'Informe nome e sobrenome';
    if (!form.responsible_email.trim()) e.responsible_email = 'E-mail do responsável é obrigatório';
    if (!form.responsible_phone.replace(/\D/g, '')) e.responsible_phone = 'Telefone do responsável é obrigatório';
    if (isCreate) {
      if (!form.login_password || form.login_password.length < 6) {
        e.login_password = 'Senha deve ter pelo menos 6 caracteres';
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const firstError = Object.keys(e)[0];
      const labels: Record<string, string> = {
        name: 'Razão Social', cnpj: 'CNPJ', email: 'E-mail da empresa', phone: 'Telefone da empresa',
        address_street: 'Rua', address_number: 'Número', address_neighborhood: 'Bairro',
        address_city: 'Cidade', address_state: 'Estado', address_cep: 'CEP',
        responsible_name: 'Nome do responsável', responsible_email: 'E-mail do responsável',
        responsible_phone: 'WhatsApp do responsável',
        login_password: 'Senha de acesso',
      };
      toast.error(`${labels[firstError] || firstError}: ${e[firstError]}`);
      return false;
    }
    return true;
  }


  function buildData(): ResellerFormData {
    return {
      name: form.name.trim(),
      cnpj: form.cnpj.replace(/\D/g, ''),
      email: form.email.trim(),
      phone: form.phone.replace(/\D/g, ''),
      address_street: form.address_street.trim(),
      address_number: form.address_number.trim(),
      address_neighborhood: form.address_neighborhood.trim(),
      address_city: form.address_city.trim(),
      address_state: form.address_state,
      address_cep: form.address_cep.replace(/\D/g, ''),
      responsible_name: form.responsible_name.trim(),
      responsible_email: form.responsible_email.trim(),
      responsible_phone: form.responsible_phone.replace(/\D/g, ''),
      activation_fee: parseFloat(form.activation_fee) || 180,
      monthly_fee: parseFloat(form.monthly_fee) || 29.90,
      invoice_due_day: parseInt(form.due_day) || 10,
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!validate(true) || !user) return;
    setIsSaving(true);
    const newResellerId = await createReseller(buildData(), user.id);
    if (newResellerId) {
      // Create login user via edge function
      const { data: invokeData, error: invokeErr } = await supabase.functions.invoke('create-reseller-user', {
        body: {
          reseller_id: newResellerId,
          email: form.responsible_email.trim(),
          password: form.login_password,
          full_name: form.responsible_name.trim(),
        },
      });
      if (invokeErr || (invokeData as any)?.error) {
        const msg = (invokeData as any)?.error || invokeErr?.message || 'Erro ao criar login';
        toast.error(`Revendedor criado, mas falhou ao criar login: ${msg}`);
      } else {
        toast.success('Login do revendedor criado com sucesso!');
      }
      setIsCreateOpen(false);
      resetForm();
    }
    setIsSaving(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate(false) || !editingReseller) return;
    setIsSaving(true);
    const success = await updateReseller(editingReseller, buildData());
    if (success) { setIsEditOpen(false); setEditingReseller(null); resetForm(); }
    setIsSaving(false);
  }

  async function handleCreateAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!accessReseller) return;
    if (!accessReseller.email) {
      toast.error('Revendedor sem e-mail do responsável. Edite o cadastro primeiro.');
      return;
    }
    if (!accessPassword || accessPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setIsCreatingAccess(true);
    const { data, error } = await supabase.functions.invoke('create-reseller-user', {
      body: {
        reseller_id: accessReseller.id,
        email: accessReseller.email,
        password: accessPassword,
        full_name: accessReseller.name,
      },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Erro ao criar acesso');
    } else {
      toast.success('Acesso criado com sucesso!');
      setAccessReseller(null);
      setAccessPassword('');
      // Refresh list to update user_id
      window.location.reload();
    }
    setIsCreatingAccess(false);
  }

  const filteredResellers = resellers.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.cnpj || '').includes(searchTerm.replace(/\D/g, ''))
  );

  const totalMRR = resellers.reduce((sum, r) => sum + r.mrr, 0);
  const totalCompanies = resellers.reduce((sum, r) => sum + r.total_companies, 0);
  const activeResellers = resellers.filter(r => r.status === 'active').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  function ErrorMsg({ field }: { field: string }) {
    return errors[field] ? <p className="text-sm text-destructive">{errors[field]}</p> : null;
  }

  const formFields = (
    <ScrollArea className="h-[60vh] pr-4">
      <div className="space-y-6 pb-2">
        {/* Company info */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Dados da Empresa</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Razão Social *</Label>
              <Input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Razão Social da empresa" disabled={isSaving} />
              <ErrorMsg field="name" />
            </div>
            <div className="space-y-1">
              <Label>CNPJ *</Label>
              <Input value={form.cnpj} onChange={e => setField('cnpj', maskCNPJ(e.target.value))} placeholder="XX.XXX.XXX/XXXX-XX" disabled={isSaving} maxLength={18} />
              <ErrorMsg field="cnpj" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>E-mail da empresa *</Label>
                <Input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="empresa@exemplo.com" disabled={isSaving} />
                <ErrorMsg field="email" />
              </div>
              <div className="space-y-1">
                <Label>Telefone da empresa *</Label>
                <Input value={form.phone} onChange={e => setField('phone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" disabled={isSaving} maxLength={15} />
                <ErrorMsg field="phone" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Address */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Endereço</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div className="space-y-1">
                <Label>Rua *</Label>
                <Input value={form.address_street} onChange={e => setField('address_street', e.target.value)} placeholder="Rua / Avenida" disabled={isSaving} />
                <ErrorMsg field="address_street" />
              </div>
              <div className="space-y-1">
                <Label>Número *</Label>
                <Input value={form.address_number} onChange={e => setField('address_number', e.target.value)} placeholder="Nº" disabled={isSaving} />
                <ErrorMsg field="address_number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Bairro *</Label>
                <Input value={form.address_neighborhood} onChange={e => setField('address_neighborhood', e.target.value)} placeholder="Bairro" disabled={isSaving} />
                <ErrorMsg field="address_neighborhood" />
              </div>
              <div className="space-y-1">
                <Label>CEP *</Label>
                <Input value={form.address_cep} onChange={e => setField('address_cep', maskCEP(e.target.value))} placeholder="00000-000" disabled={isSaving} maxLength={9} />
                <ErrorMsg field="address_cep" />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div className="space-y-1">
                <Label>Cidade *</Label>
                <Input value={form.address_city} onChange={e => setField('address_city', e.target.value)} placeholder="Cidade" disabled={isSaving} />
                <ErrorMsg field="address_city" />
              </div>
              <div className="space-y-1">
                <Label>Estado *</Label>
                <Select value={form.address_state} onValueChange={v => setField('address_state', v)} disabled={isSaving}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
                <ErrorMsg field="address_state" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Responsible person */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Responsável</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome completo *</Label>
              <Input value={form.responsible_name} onChange={e => setField('responsible_name', e.target.value)} placeholder="Nome e sobrenome" disabled={isSaving} />
              <ErrorMsg field="responsible_name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>E-mail *</Label>
                <Input type="email" value={form.responsible_email} onChange={e => setField('responsible_email', e.target.value)} placeholder="responsavel@email.com" disabled={isSaving} />
                <ErrorMsg field="responsible_email" />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp *</Label>
                <Input value={form.responsible_phone} onChange={e => setField('responsible_phone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" disabled={isSaving} maxLength={15} />
                <ErrorMsg field="responsible_phone" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Commercial settings */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Configurações Comerciais</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Dia de vencimento da fatura</Label>
              <Select value={form.due_day} onValueChange={v => setField('due_day', v)} disabled={isSaving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Dia 5</SelectItem>
                  <SelectItem value="10">Dia 10</SelectItem>
                  <SelectItem value="15">Dia 15</SelectItem>
                  <SelectItem value="20">Dia 20</SelectItem>
                  <SelectItem value="25">Dia 25</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Taxa de ativação (R$)</Label>
                <Input type="number" step="0.01" value={form.activation_fee} onChange={e => setField('activation_fee', e.target.value)} disabled={isSaving} />
              </div>
              <div className="space-y-1">
                <Label>Mensalidade (R$)</Label>
                <Input type="number" step="0.01" value={form.monthly_fee} onChange={e => setField('monthly_fee', e.target.value)} disabled={isSaving} />
              </div>
            </div>
          </div>
        </div>

        {!isEditOpen && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Acesso ao Portal</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>E-mail de login</Label>
                  <Input value={form.responsible_email} disabled placeholder="Será o e-mail do responsável acima" />
                  <p className="text-xs text-muted-foreground">O revendedor usará o e-mail do responsável para entrar.</p>
                </div>
                <div className="space-y-1">
                  <Label>Senha de acesso *</Label>
                  <Input
                    type="text"
                    value={form.login_password}
                    onChange={e => setField('login_password', e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    disabled={isSaving}
                    autoComplete="new-password"
                  />
                  <ErrorMsg field="login_password" />
                  <p className="text-xs text-muted-foreground">Anote esta senha — ela será usada pelo revendedor no primeiro acesso.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );

  const headerActions = (
    <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Revendedor</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Revendedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          {formFields}
          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Criar Revendedor
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppLayout title="Revendedores" actions={headerActions}>
      <div className="space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Revendedores Ativos</CardTitle>
              <UserCheck className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeResellers}</div>
              <p className="text-xs text-muted-foreground">de {resellers.length} total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Empresas via Revenda</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCompanies}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">MRR Total Revenda</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {totalMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Resellers List */}
        <Card>
          <CardHeader>
            <CardTitle>Revendedores Cadastrados</CardTitle>
            <CardDescription>Gerencie os revendedores do sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar revendedor..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-center">Empresas</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResellers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum revendedor encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredResellers.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{r.name}</span>
                            <p className="text-xs text-muted-foreground">{r.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.cnpj ? maskCNPJ(r.cnpj) : '-'}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm">{r.responsible_name || '-'}</span>
                            {r.responsible_phone && (
                              <p className="text-xs text-muted-foreground">{maskPhone(r.responsible_phone)}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{r.total_companies}</TableCell>
                        <TableCell className="text-right font-medium">
                          R$ {r.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>
                            {r.status === 'active' ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(r.id)}>
                              <Pencil className="w-3 h-3" /> Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => setAssignReseller({ id: r.id, name: r.name })}
                            >
                              <Link2 className="w-3 h-3" /> Vincular lojas
                            </Button>
                            {!r.user_id && (
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1"
                                onClick={() => {
                                  setAccessReseller({
                                    id: r.id,
                                    email: r.responsible_email || '',
                                    name: r.responsible_name || r.name,
                                  });
                                  setAccessPassword('');
                                }}
                              >
                                <KeyRound className="w-3 h-3" /> Criar acesso
                              </Button>
                            )}
                            <Button
                              variant={r.status === 'active' ? 'outline' : 'default'}
                              size="sm" className="gap-1"
                              onClick={() => toggleResellerStatus(r.id, r.status)}
                            >
                              {r.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                              {r.status === 'active' ? 'Pausar' : 'Ativar'}
                            </Button>
                            {r.user_id && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="gap-1"
                                onClick={async () => {
                                  const ok = await impersonateReseller(r.id);
                                  if (ok) navigate('/revendedor/home');
                                }}
                              >
                                <Eye className="w-3 h-3" /> Acessar painel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingReseller(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Revendedor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {formFields}
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Alterações
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Access Dialog */}
      <Dialog open={!!accessReseller} onOpenChange={(o) => { if (!o) { setAccessReseller(null); setAccessPassword(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar acesso ao portal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAccess} className="space-y-4">
            <div className="space-y-1">
              <Label>E-mail de login</Label>
              <Input value={accessReseller?.email || ''} disabled />
              <p className="text-xs text-muted-foreground">
                E-mail do responsável. Se já existir uma conta com este e-mail, a senha será atualizada.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Senha de acesso *</Label>
              <Input
                type="text"
                value={accessPassword}
                onChange={e => setAccessPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={isCreatingAccess}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">Anote esta senha — ela será informada ao revendedor.</p>
            </div>
            <Button type="submit" className="w-full" disabled={isCreatingAccess}>
              {isCreatingAccess && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Criar acesso
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Companies Dialog */}
      <AssignCompaniesDialog
        open={!!assignReseller}
        onOpenChange={(o) => { if (!o) setAssignReseller(null); }}
        resellerId={assignReseller?.id || null}
        resellerName={assignReseller?.name || ''}
        onAssigned={refetch}
      />
    </AppLayout>
  );
}
