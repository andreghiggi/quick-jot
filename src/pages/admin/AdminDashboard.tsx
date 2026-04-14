import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyPlans } from '@/hooks/useCompanyPlans';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Building2, 
  Plus, 
  Loader2, 
  ExternalLink,
  Search,
  Play,
  Pause,
  Calendar,
  Eye,
  Copy,
  EyeOff,
  Pencil
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  login_email: string | null;
  initial_password: string | null;
}

interface CompanyPlan {
  id: string;
  company_id: string;
  plan_name: string;
  starts_at: string;
  expires_at: string | null;
  active: boolean;
  activated_at: string | null;
}

export default function AdminDashboard() {
  const { user, impersonateCompany } = useAuthContext();
  const navigate = useNavigate();
  const { activateTrial, deactivatePlan, loading: planLoading } = useCompanyPlans();
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyPlans, setCompanyPlans] = useState<Record<string, CompanyPlan>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  
  // Edit credentials state
  const [editCredentialsCompanyId, setEditCredentialsCompanyId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  
  // New company form
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanySlug, setNewCompanySlug] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [newCompanyEmail, setNewCompanyEmail] = useState('');
  const [newCompanyPassword, setNewCompanyPassword] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (companiesError) throw companiesError;
      setCompanies(companiesData || []);
      
      // Fetch plans for all companies
      const { data: plansData, error: plansError } = await supabase
        .from('company_plans')
        .select('*');
      
      if (plansError) throw plansError;
      
      const plansMap: Record<string, CompanyPlan> = {};
      (plansData || []).forEach((plan: CompanyPlan) => {
        plansMap[plan.company_id] = plan;
      });
      setCompanyPlans(plansMap);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateTrial(companyId: string) {
    if (!user) return;
    const success = await activateTrial(companyId, user.id);
    if (success) {
      fetchCompanies();
    }
  }

  async function handleDeactivatePlan(companyId: string) {
    const success = await deactivatePlan(companyId);
    if (success) {
      fetchCompanies();
    }
  }

  async function handleAccessCompany(companyId: string) {
    const success = await impersonateCompany(companyId);
    if (success) {
      navigate('/');
    }
  }

  function getPlanStatus(companyId: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; expiresAt?: string } {
    const plan = companyPlans[companyId];
    if (!plan) {
      return { label: 'Sem plano', variant: 'outline' };
    }
    if (!plan.active) {
      return { label: 'Aguardando ativação', variant: 'secondary' };
    }
    if (plan.expires_at) {
      const expiresAt = new Date(plan.expires_at);
      const now = new Date();
      if (expiresAt < now) {
        return { label: 'Expirado', variant: 'destructive' };
      }
      return { 
        label: `Trial ativo`, 
        variant: 'default',
        expiresAt: format(expiresAt, "dd/MM/yyyy", { locale: ptBR })
      };
    }
    return { label: 'Ativo', variant: 'default' };
  }

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    
    if (!newCompanyName.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    const slug = newCompanySlug.trim() || generateSlug(newCompanyName);

    setIsCreating(true);
    try {
      const { error } = await supabase
        .from('companies')
        .insert({
          name: newCompanyName.trim(),
          slug,
          phone: newCompanyPhone.trim() || null,
          login_email: newCompanyEmail.trim() || null,
          initial_password: newCompanyPassword.trim() || null,
        });

      if (error) throw error;

      toast.success('Empresa criada com sucesso!');
      setIsDialogOpen(false);
      setNewCompanyName('');
      setNewCompanySlug('');
      setNewCompanyPhone('');
      setNewCompanyEmail('');
      setNewCompanyPassword('');
      fetchCompanies();
    } catch (error: any) {
      console.error('Error creating company:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma empresa com esse slug');
      } else {
        toast.error('Erro ao criar empresa');
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveCredentials() {
    if (!editCredentialsCompanyId) return;
    if (!editEmail.trim()) {
      toast.error('E-mail é obrigatório');
      return;
    }
    setIsSavingCredentials(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          login_email: editEmail.trim(),
          initial_password: editPassword.trim() || null,
        })
        .eq('id', editCredentialsCompanyId);
      if (error) throw error;
      toast.success('Credenciais salvas!');
      setEditCredentialsCompanyId(null);
      setEditEmail('');
      setEditPassword('');
      fetchCompanies();
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Erro ao salvar credenciais');
    } finally {
      setIsSavingCredentials(false);
    }
  }

  const filteredCompanies = companies.filter(company =>
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const headerActions = (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Empresa</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Nova Empresa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateCompany} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome da Empresa *</Label>
            <Input
              id="company-name"
              placeholder="Ex: Hamburgueria do João"
              value={newCompanyName}
              onChange={(e) => {
                setNewCompanyName(e.target.value);
                if (!newCompanySlug) {
                  setNewCompanySlug(generateSlug(e.target.value));
                }
              }}
              disabled={isCreating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-slug">Slug (URL)</Label>
            <Input
              id="company-slug"
              placeholder="hamburgueria-do-joao"
              value={newCompanySlug}
              onChange={(e) => setNewCompanySlug(e.target.value)}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              URL do cardápio: /cardapio/{newCompanySlug || 'slug-da-empresa'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-phone">WhatsApp</Label>
            <Input
              id="company-phone"
              placeholder="5511999999999"
              value={newCompanyPhone}
              onChange={(e) => setNewCompanyPhone(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-email">Login (E-mail)</Label>
            <Input
              id="company-email"
              type="email"
              placeholder="loja@email.com"
              value={newCompanyEmail}
              onChange={(e) => setNewCompanyEmail(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-password">Senha Inicial</Label>
            <Input
              id="company-password"
              placeholder="Senha inicial da loja"
              value={newCompanyPassword}
              onChange={(e) => setNewCompanyPassword(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isCreating}>
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Empresa
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppLayout title="Painel Admin" actions={headerActions}>
      <div className="space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Empresas</CardTitle>
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{companies.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Empresas Ativas</CardTitle>
              <Building2 className="w-4 h-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {companies.filter(c => c.active).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Empresas Inativas</CardTitle>
              <Building2 className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {companies.filter(c => !c.active).length}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Companies List */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Empresas Cadastradas</CardTitle>
              <CardDescription>Gerencie as empresas do sistema</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Criação</TableHead>
                    <TableHead>Login / Senha</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Ativação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhuma empresa encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCompanies.map((comp) => {
                      const planStatus = getPlanStatus(comp.id);
                      const plan = companyPlans[comp.id];
                      return (
                        <TableRow key={comp.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{comp.name}</span>
                              <span className="text-xs text-muted-foreground">{comp.slug}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comp.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </TableCell>
                          <TableCell>
                            {comp.login_email ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono">{comp.login_email}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(comp.login_email!); toast.success('Email copiado!'); }} className="text-muted-foreground hover:text-foreground">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                {comp.initial_password && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-mono">
                                      {visiblePasswords[comp.id] ? comp.initial_password : '••••••••'}
                                    </span>
                                    <button onClick={() => setVisiblePasswords(prev => ({ ...prev, [comp.id]: !prev[comp.id] }))} className="text-muted-foreground hover:text-foreground">
                                      {visiblePasswords[comp.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => { navigator.clipboard.writeText(comp.initial_password!); toast.success('Senha copiada!'); }} className="text-muted-foreground hover:text-foreground">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={() => {
                                  setEditCredentialsCompanyId(comp.id);
                                  setEditEmail(comp.login_email || '');
                                  setEditPassword(comp.initial_password || '');
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                                Editar credenciais
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={planStatus.variant}>
                                {planStatus.label}
                              </Badge>
                              {planStatus.expiresAt && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Expira: {planStatus.expiresAt}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {plan?.activated_at ? (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(plan.activated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={comp.active ? 'default' : 'secondary'}>
                              {comp.active ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {plan && !plan.active && (
                                <Button 
                                  variant="default" 
                                  size="sm" 
                                  className="gap-1"
                                  onClick={() => handleActivateTrial(comp.id)}
                                  disabled={planLoading}
                                >
                                  <Play className="w-3 h-3" />
                                  Ativar Trial
                                </Button>
                              )}
                              {plan && plan.active && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="gap-1"
                                  onClick={() => handleDeactivatePlan(comp.id)}
                                  disabled={planLoading}
                                >
                                  <Pause className="w-3 h-3" />
                                  Pausar
                                </Button>
                              )}
                              <Link to={`/admin/empresa/${comp.id}/modulos`}>
                                <Button variant="outline" size="sm" className="gap-1">
                                  <ExternalLink className="w-3 h-3" />
                                  Módulos
                                </Button>
                              </Link>
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="gap-1"
                                onClick={() => handleAccessCompany(comp.id)}
                              >
                                <Eye className="w-3 h-3" />
                                Acessar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Credentials Dialog */}
      <Dialog open={!!editCredentialsCompanyId} onOpenChange={(open) => { if (!open) setEditCredentialsCompanyId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Credenciais</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Login (E-mail) *</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="loja@email.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                disabled={isSavingCredentials}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Senha Inicial</Label>
              <Input
                id="edit-password"
                placeholder="Senha inicial da loja"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={isSavingCredentials}
              />
            </div>
            <Button onClick={handleSaveCredentials} className="w-full" disabled={isSavingCredentials}>
              {isSavingCredentials ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Credenciais
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
