import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useResellers } from '@/hooks/useResellers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Loader2,
  Search,
  Play,
  Pause,
  Pencil,
  Eye,
  Users,
  DollarSign,
  UserCheck,
} from 'lucide-react';

export default function ResellersPage() {
  const { user } = useAuthContext();
  const { resellers, loading, createReseller, updateReseller, toggleResellerStatus } = useResellers();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingReseller, setEditingReseller] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDueDay, setFormDueDay] = useState('10');
  const [formActivationFee, setFormActivationFee] = useState('180.00');
  const [formMonthlyFee, setFormMonthlyFee] = useState('29.90');

  function resetForm() {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormDueDay('10');
    setFormActivationFee('180.00');
    setFormMonthlyFee('29.90');
  }

  function openEdit(resellerId: string) {
    const r = resellers.find(x => x.id === resellerId);
    if (!r) return;
    setFormName(r.name);
    setFormEmail(r.email);
    setFormPhone(r.phone || '');
    setFormDueDay(String(r.settings?.invoice_due_day || 10));
    setFormActivationFee(String(r.settings?.activation_fee || 180));
    setFormMonthlyFee(String(r.settings?.monthly_fee || 29.90));
    setEditingReseller(resellerId);
    setIsEditOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !user) return;

    setIsSaving(true);
    const success = await createReseller({
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || undefined,
      activation_fee: parseFloat(formActivationFee) || 180,
      monthly_fee: parseFloat(formMonthlyFee) || 29.90,
      invoice_due_day: parseInt(formDueDay) || 10,
    }, user.id);

    if (success) {
      setIsCreateOpen(false);
      resetForm();
    }
    setIsSaving(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReseller) return;

    setIsSaving(true);
    const success = await updateReseller(editingReseller, {
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || null,
      activation_fee: parseFloat(formActivationFee) || 180,
      monthly_fee: parseFloat(formMonthlyFee) || 29.90,
      invoice_due_day: parseInt(formDueDay) || 10,
    });

    if (success) {
      setIsEditOpen(false);
      setEditingReseller(null);
      resetForm();
    }
    setIsSaving(false);
  }

  const filteredResellers = resellers.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.email.toLowerCase().includes(searchTerm.toLowerCase())
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

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome do revendedor" disabled={isSaving} />
      </div>
      <div className="space-y-2">
        <Label>E-mail *</Label>
        <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@exemplo.com" disabled={isSaving} />
      </div>
      <div className="space-y-2">
        <Label>WhatsApp</Label>
        <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="5511999999999" disabled={isSaving} />
      </div>
      <div className="space-y-2">
        <Label>Dia de vencimento da fatura</Label>
        <Select value={formDueDay} onValueChange={setFormDueDay} disabled={isSaving}>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Taxa de ativação (R$)</Label>
          <Input type="number" step="0.01" value={formActivationFee} onChange={e => setFormActivationFee(e.target.value)} disabled={isSaving} />
        </div>
        <div className="space-y-2">
          <Label>Mensalidade (R$)</Label>
          <Input type="number" step="0.01" value={formMonthlyFee} onChange={e => setFormMonthlyFee(e.target.value)} disabled={isSaving} />
        </div>
      </div>
    </div>
  );

  const headerActions = (
    <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Revendedor</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
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
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead className="text-center">Empresas Ativas</TableHead>
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
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.email}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.phone || '-'}</TableCell>
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openEdit(r.id)}
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </Button>
                            <Button
                              variant={r.status === 'active' ? 'outline' : 'default'}
                              size="sm"
                              className="gap-1"
                              onClick={() => toggleResellerStatus(r.id, r.status)}
                            >
                              {r.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                              {r.status === 'active' ? 'Pausar' : 'Ativar'}
                            </Button>
                            <Button variant="secondary" size="sm" className="gap-1" disabled>
                              <Eye className="w-3 h-3" />
                              Acessar painel
                            </Button>
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
        <DialogContent>
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
    </AppLayout>
  );
}
