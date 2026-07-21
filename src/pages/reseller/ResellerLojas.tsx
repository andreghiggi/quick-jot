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
import { Plus, Loader2, Search, Eye, Settings, Building2, AlertTriangle, Ban } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StoreDetailDialog, StoreDetail } from '@/components/reseller/StoreDetailDialog';
import { CompanyModulesDialog } from '@/components/admin/CompanyModulesDialog';
import { toast } from 'sonner';
import { useResellerCompanyEnrichment } from '@/hooks/useResellerCompanyEnrichment';
import { moduleShortLabel } from '@/lib/moduleLabels';

export default function ResellerLojas() {
  const navigate = useNavigate();
  const { impersonateCompany } = useAuthContext();
  const { reseller, companies, settings, loading, createCompany, refetch } = useResellerPortal();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const [selectedStore, setSelectedStore] = useState<StoreDetail | null>(null);
  const [modulesCompany, setModulesCompany] = useState<{ id: string; name: string } | null>(null);

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
  // form state — Pagamento da ativação
  const [paymentOption, setPaymentOption] = useState<'now' | '30_days' | '3x_no_entry' | '3x_entry'>('now');
  // form state — Vencimento das mensalidades desta loja
  const [dueDay, setDueDay] = useState<string>('20');

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
    setPaymentOption('now');
    setDueDay('20');
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
      activation_payment_option: paymentOption,
      next_invoice_due_day: Number(dueDay),
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



  const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const term = normalize(searchTerm);
  const filteredCompanies = companies.filter(c => {
    if (!term) return true;
    const any = c as any;
    const digits = term.replace(/\D/g, '');
    return (
      normalize(c.name).includes(term) ||
      normalize(c.slug).includes(term) ||
      normalize(any.razao_social || '').includes(term) ||
      normalize(any.serial || '').includes(term) ||
      (digits && (any.cnpj || '').replace(/\D/g, '').includes(digits))
    );
  });

  const enrichment = useResellerCompanyEnrichment(filteredCompanies.map(c => c.id));
  const monthlyFee = settings?.monthly_fee ?? 0;
  const fmtMoney = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
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
              <div className="space-y-2">
                <Label>Dia de vencimento das mensalidades *</Label>
                <Select value={dueDay} onValueChange={setDueDay} disabled={isCreating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 25].map(d => (
                      <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define o dia em que as faturas mensais desta loja vencerão.
                </p>
              </div>
            </section>

            {/* Pagamento da Ativação */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pagamento da Ativação</h3>
              {settings && (
                <p className="text-xs text-muted-foreground">
                  Taxa de ativação: <strong>R$ {settings.activation_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </p>
              )}
              {(() => {
                const fee = settings?.activation_fee ?? 0;
                const fmt = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const partBase = Math.round((fee / 3) * 100) / 100;
                const valueNow = fee;
                const value30 = fee + 20;
                const installmentNoEntry = partBase + 15;
                const totalNoEntry = installmentNoEntry * 3;
                const entryValue = partBase;
                const installmentEntry = partBase + 15;
                const totalEntry = entryValue + installmentEntry * 2;
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isCreating}
                        onClick={() => setPaymentOption('now')}
                        className={`text-left rounded-md border p-3 transition ${paymentOption === 'now' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
                      >
                        <div className="text-sm font-semibold">À vista</div>
                        <div className="text-xs text-muted-foreground mt-1">Vence em 3 dias</div>
                        <div className="text-base font-bold text-primary mt-1">{fmt(valueNow)}</div>
                      </button>
                      <button
                        type="button"
                        disabled={isCreating}
                        onClick={() => setPaymentOption('30_days')}
                        className={`text-left rounded-md border p-3 transition ${paymentOption === '30_days' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
                      >
                        <div className="text-sm font-semibold">Vencimento no próximo mês</div>
                        <div className="text-xs text-muted-foreground mt-1">Dia {dueDay} do mês seguinte</div>
                        <div className="text-base font-bold text-primary mt-1">{fmt(value30)}</div>
                      </button>
                      <button
                        type="button"
                        disabled={isCreating}
                        onClick={() => setPaymentOption(prev => (prev === '3x_no_entry' || prev === '3x_entry' ? prev : '3x_no_entry'))}
                        className={`text-left rounded-md border p-3 transition ${(paymentOption === '3x_no_entry' || paymentOption === '3x_entry') ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
                      >
                        <div className="text-sm font-semibold">Parcelado em 3x</div>
                        <div className="text-xs text-muted-foreground mt-1">3x de {fmt(installmentNoEntry)}</div>
                        <div className="text-base font-bold text-primary mt-1">{fmt(totalNoEntry)}</div>
                      </button>
                    </div>

                    {(paymentOption === '3x_no_entry' || paymentOption === '3x_entry') && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Como parcelar?</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isCreating}
                            onClick={() => setPaymentOption('3x_no_entry')}
                            className={`text-left rounded-md border p-2 text-xs transition ${paymentOption === '3x_no_entry' ? 'border-primary bg-background ring-1 ring-primary' : 'bg-background/60 hover:bg-background'}`}
                          >
                            <div className="font-semibold text-sm">Sem entrada</div>
                            <div className="text-muted-foreground mt-1">3x de {fmt(installmentNoEntry)} (a partir do próximo mês, dia {dueDay})</div>
                            <div className="text-sm font-bold text-primary mt-1">Total: {fmt(totalNoEntry)}</div>
                          </button>
                          <button
                            type="button"
                            disabled={isCreating}
                            onClick={() => setPaymentOption('3x_entry')}
                            className={`text-left rounded-md border p-2 text-xs transition ${paymentOption === '3x_entry' ? 'border-primary bg-background ring-1 ring-primary' : 'bg-background/60 hover:bg-background'}`}
                          >
                            <div className="font-semibold text-sm">Com entrada</div>
                            <div className="text-muted-foreground mt-1">Entrada {fmt(entryValue)} + 2x de {fmt(installmentEntry)}</div>
                            <div className="text-sm font-bold text-primary mt-1">Total: {fmt(totalEntry)}</div>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
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
                    <span>Vencimento desta loja:</span>
                    <span>Dia {dueDay} de cada mês</span>
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

        {filteredCompanies.length === 0 ? (
          <div className="rounded-md border py-10 text-center text-muted-foreground text-sm">
            Nenhuma loja encontrada
          </div>
        ) : (
          <div className="space-y-2">
            {filteredCompanies.map(c => {
              const any = c as any;
              const info = enrichment.data.get(c.id);
              const modules = info?.modules ?? [];
              const openInv = info?.nextOpenInvoice ?? null;

              const licStatus: string = any.license_status || 'active';
              const isCanceled = licStatus === 'canceled';
              const isManuallyBlocked = licStatus === 'blocked';
              const isSuspended = !!openInv && openInv.days_overdue > 3;
              const isOverdue = !!openInv && openInv.is_overdue;

              const statusPill = (() => {
                if (isCanceled) return <Badge variant="destructive" className="gap-1"><Ban className="w-3 h-3" />Cancelada</Badge>;
                if (isManuallyBlocked) return <Badge variant="destructive" className="gap-1"><Ban className="w-3 h-3" />Travada</Badge>;
                if (!c.active) return <Badge variant="outline">Inativa</Badge>;
                if (isSuspended) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Suspensa</Badge>;
                if (isOverdue) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 gap-1"><AlertTriangle className="w-3 h-3" />Vencida</Badge>;
                if (openInv) return <Badge variant="outline" className="text-yellow-700 border-yellow-400">Fatura em aberto</Badge>;
                return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Ativa</Badge>;
              })();

              return (
                <Card key={c.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      {/* Coluna 1: Serial + identidade */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="rounded-md bg-primary/10 text-primary p-2 shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] font-bold tracking-wider bg-muted px-1.5 py-0.5 rounded select-all">
                              {any.serial || '—'}
                            </span>
                            {statusPill}
                          </div>
                          <div className="font-semibold truncate mt-1">{c.name}</div>
                          {any.razao_social && (
                            <div className="text-xs text-muted-foreground truncate">
                              {any.razao_social}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {any.cnpj && <span>CNPJ: {any.cnpj}</span>}
                            {any.address_city && (
                              <span>{any.address_city}{any.address_state ? `/${any.address_state}` : ''}</span>
                            )}
                            <span>Criada em {format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          </div>
                        </div>
                      </div>

                      {/* Coluna 2: Módulos */}
                      <div className="lg:w-64 xl:w-72 shrink-0">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Módulos ({modules.length})
                        </div>
                        {modules.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Nenhum</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {modules.slice(0, 6).map(m => (
                              <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {moduleShortLabel(m)}
                              </Badge>
                            ))}
                            {modules.length > 6 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{modules.length - 6}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Coluna 3: Mensalidade / fatura */}
                      <div className="lg:w-44 shrink-0 lg:text-right">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Mensalidade
                        </div>
                        <div className="font-bold text-base">{fmtMoney(monthlyFee)}</div>
                        {openInv ? (
                          <div className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {isOverdue
                              ? `Vencida há ${openInv.days_overdue}d`
                              : `Vence em ${format(new Date(openInv.due_date + 'T12:00:00'), 'dd/MM')}`}
                          </div>
                        ) : (
                          <div className="text-xs text-green-600 mt-0.5">Em dia</div>
                        )}
                      </div>

                      {/* Coluna 4: Ações */}
                      <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setSelectedStore(c as unknown as StoreDetail)}
                          title="Ver detalhes da loja e faturas"
                        >
                          <Eye className="w-3 h-3" />
                          <span className="hidden sm:inline">Detalhes</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setModulesCompany({ id: c.id, name: c.name })}
                          title="Habilitar/Desabilitar módulos"
                        >
                          <Settings className="w-3 h-3" />
                          <span className="hidden sm:inline">Módulos</span>
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <StoreDetailDialog
        store={selectedStore}
        canEdit={false}
        onClose={() => {
          setSelectedStore(null);
          refetch();
        }}
      />

      <CompanyModulesDialog
        companyId={modulesCompany?.id || null}
        companyName={modulesCompany?.name}
        onClose={() => setModulesCompany(null)}
      />
    </ResellerLayout>
  );
}
