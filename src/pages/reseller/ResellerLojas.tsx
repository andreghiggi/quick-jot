import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, Search, Eye, RefreshCw, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StoreDetailDialog, StoreDetail } from '@/components/reseller/StoreDetailDialog';
import { toast } from 'sonner';

export default function ResellerLojas() {
  const navigate = useNavigate();
  const { impersonateCompany } = useAuthContext();
  const { reseller, companies, settings, loading, createCompany, refetch } = useResellerPortal();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreDetail | null>(null);

  // form state — Empresa
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newRazao, setNewRazao] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // form state — Endereço
  const [newCep, setNewCep] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  // form state — Responsável
  const [respName, setRespName] = useState('');
  const [respCpf, setRespCpf] = useState('');
  const [respRg, setRespRg] = useState('');
  const [respEmail, setRespEmail] = useState('');
  const [respPhone, setRespPhone] = useState('');

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function resetForm() {
    setNewName(''); setNewSlug(''); setNewRazao(''); setNewCnpj('');
    setNewPhone(''); setNewEmail(''); setNewPassword('');
    setNewCep(''); setNewStreet(''); setNewNumber('');
    setNewNeighborhood(''); setNewCity(''); setNewState('');
    setRespName(''); setRespCpf(''); setRespRg(''); setRespEmail(''); setRespPhone('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    const missing: string[] = [];
    if (!newName.trim()) missing.push('Nome da Loja');
    if (!newRazao.trim()) missing.push('Razão Social');
    if (!newCnpj.trim()) missing.push('CNPJ');
    if (!newEmail.trim()) missing.push('E-mail Comercial');
    if (!newPhone.trim()) missing.push('Telefone');
    if (!newCep.trim()) missing.push('CEP');
    if (!newStreet.trim()) missing.push('Rua');
    if (!newNumber.trim()) missing.push('Número');
    if (!newNeighborhood.trim()) missing.push('Bairro');
    if (!newCity.trim()) missing.push('Cidade');
    if (!newState.trim()) missing.push('Estado');
    if (!respName.trim()) missing.push('Nome do Responsável');
    if (!respCpf.trim()) missing.push('CPF do Responsável');
    if (!respRg.trim()) missing.push('RG do Responsável');
    if (!respEmail.trim()) missing.push('E-mail do Responsável');
    if (!respPhone.trim()) missing.push('Telefone do Responsável');
    if (!newPassword.trim()) missing.push('Senha Inicial');

    if (missing.length > 0) {
      toast.error(`Preencha: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`);
      return;
    }

    setIsCreating(true);
    const slug = newSlug.trim() || generateSlug(newName);
    const success = await createCompany({
      name: newName.trim(),
      slug,
      razao_social: newRazao.trim(),
      cnpj: newCnpj.trim(),
      phone: newPhone.trim(),
      login_email: newEmail.trim(),
      initial_password: newPassword.trim(),
      address_cep: newCep.trim(),
      address_street: newStreet.trim(),
      address_number: newNumber.trim(),
      address_neighborhood: newNeighborhood.trim(),
      address_city: newCity.trim(),
      address_state: newState.trim().toUpperCase(),
      responsible_name: respName.trim(),
      responsible_cpf: respCpf.trim(),
      responsible_rg: respRg.trim(),
      responsible_email: respEmail.trim(),
      responsible_phone: respPhone.trim(),
    });

    if (success) {
      setIsCreateOpen(false);
      resetForm();
    }
    setIsCreating(false);
  }

  async function handleAccess(companyId: string) {
    const success = await impersonateCompany(companyId);
    if (success) {
      navigate('/');
    }
  }

  async function handleBackfill() {
    if (!reseller) return;
    setIsBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reseller-billing', {
        body: { action: 'backfill_invoices', reseller_id: reseller.id },
      });
      if (error) throw error;
      const count = data?.invoices_created ?? 0;
      toast.success(`${count} fatura(s) gerada(s) com sucesso!`);
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar faturas: ' + (err.message || 'falha desconhecida'));
    } finally {
      setIsBackfilling(false);
    }
  }

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={handleBackfill}
        disabled={isBackfilling}
        className="gap-2"
        title="Gera todas as faturas retroativas (proporcional + cheias) desde a ativação de cada loja"
      >
        {isBackfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        <span className="hidden sm:inline">Gerar Faturas</span>
      </Button>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Loja</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Loja</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-6">
            {/* Dados da Empresa */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dados da Empresa</h3>
              <div className="space-y-2">
                <Label>Razão Social *</Label>
                <Input value={newRazao} onChange={e => setNewRazao(e.target.value)} disabled={isCreating} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CNPJ *</Label>
                  <Input placeholder="00.000.000/0000-00" value={newCnpj} onChange={e => setNewCnpj(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail Comercial *</Label>
                  <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input placeholder="(54) 99999-9999" value={newPhone} onChange={e => setNewPhone(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>CEP *</Label>
                  <Input placeholder="00000-000" value={newCep} onChange={e => setNewCep(e.target.value)} disabled={isCreating} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rua *</Label>
                <Input value={newStreet} onChange={e => setNewStreet(e.target.value)} disabled={isCreating} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Número *</Label>
                  <Input value={newNumber} onChange={e => setNewNumber(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>Bairro *</Label>
                  <Input value={newNeighborhood} onChange={e => setNewNeighborhood(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>Cidade *</Label>
                  <Input value={newCity} onChange={e => setNewCity(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>Estado *</Label>
                  <Input maxLength={2} placeholder="RS" value={newState} onChange={e => setNewState(e.target.value.toUpperCase())} disabled={isCreating} />
                </div>
              </div>
            </section>

            {/* Dados do Responsável */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dados do Responsável</h3>
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input value={respName} onChange={e => setRespName(e.target.value)} disabled={isCreating} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CPF *</Label>
                  <Input placeholder="000.000.000-00" value={respCpf} onChange={e => setRespCpf(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>RG *</Label>
                  <Input value={respRg} onChange={e => setRespRg(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input type="email" value={respEmail} onChange={e => setRespEmail(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone / WhatsApp *</Label>
                  <Input placeholder="(54) 99999-9999" value={respPhone} onChange={e => setRespPhone(e.target.value)} disabled={isCreating} />
                </div>
              </div>
            </section>

            {/* Loja & Acesso */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Loja & Acesso</h3>
              <div className="space-y-2">
                <Label>Nome Fantasia da Loja *</Label>
                <Input
                  placeholder="Ex: Hamburgueria do João"
                  value={newName}
                  onChange={e => {
                    setNewName(e.target.value);
                    if (!newSlug) setNewSlug(generateSlug(e.target.value));
                  }}
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (URL)</Label>
                <Input
                  placeholder="hamburgueria-do-joao"
                  value={newSlug}
                  onChange={e => setNewSlug(e.target.value)}
                  disabled={isCreating}
                />
                <p className="text-xs text-muted-foreground">
                  URL do cardápio: /cardapio/{newSlug || 'slug-da-loja'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Senha Inicial *</Label>
                <Input
                  type="text"
                  placeholder="Senha inicial da loja"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  disabled={isCreating}
                />
              </div>
            </section>

            {settings && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Mensalidade:</span>
                    <span className="font-medium">
                      R$ {settings.monthly_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Vencimento padrão:</span>
                    <span>Dia {settings.invoice_due_day} de cada mês</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button type="submit" className="w-full" disabled={isCreating}>
              {isCreating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Cadastrar Loja
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <ResellerLayout title="Lojas" actions={headerActions}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar loja..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criação</TableHead>
                <TableHead className="text-right">Mensalidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma loja encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{c.slug}</TableCell>
                    <TableCell>
                      {c.active ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      R$ {(settings?.monthly_fee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setSelectedStore(c as unknown as StoreDetail)}
                          title="Ver faturas e detalhes"
                        >
                          <FileText className="w-3 h-3" />
                          <span className="hidden sm:inline">Faturas</span>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleAccess(c.id)}
                        >
                          <Eye className="w-3 h-3" />
                          <span className="hidden sm:inline">Acessar</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <StoreDetailDialog
        store={selectedStore}
        canEdit
        onClose={() => {
          setSelectedStore(null);
          refetch();
        }}
      />
    </ResellerLayout>
  );
}
