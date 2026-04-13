import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { useAuthContext } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, Search, Play, Pause, Eye, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function ResellerLojas() {
  const navigate = useNavigate();
  const { impersonateCompany } = useAuthContext();
  const { companies, settings, loading, createCompany, activateTrial, toggleCompanyPlan } = useResellerPortal();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newPhone, setNewPhone] = useState('');

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsCreating(true);
    const slug = newSlug.trim() || generateSlug(newName);
    const success = await createCompany({
      name: newName.trim(),
      slug,
      phone: newPhone.trim() || undefined,
    });

    if (success) {
      setIsCreateOpen(false);
      setNewName('');
      setNewSlug('');
      setNewPhone('');
    }
    setIsCreating(false);
  }

  async function handleAccess(companyId: string) {
    const success = await impersonateCompany(companyId);
    if (success) {
      navigate('/');
    }
  }

  function getPlanStatus(company: typeof companies[0]) {
    if (!company.plan) return { label: 'Sem plano', variant: 'outline' as const };
    if (!company.plan.active) return { label: 'Inativo', variant: 'secondary' as const };
    if (company.plan.expires_at) {
      const exp = new Date(company.plan.expires_at);
      if (exp < new Date()) return { label: 'Expirado', variant: 'destructive' as const };
      return { label: 'Trial', variant: 'default' as const };
    }
    return { label: 'Ativo', variant: 'default' as const };
  }

  // Prorated value calculation
  function getProratedValue(): string {
    if (!settings) return '0,00';
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysLeft = endOfMonth.getDate() - now.getDate();
    const totalDays = endOfMonth.getDate();
    const prorated = (settings.monthly_fee / totalDays) * daysLeft;
    return prorated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Loja</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar Nova Loja</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Loja *</Label>
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
            <Label>WhatsApp</Label>
            <Input
              placeholder="5511999999999"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              disabled={isCreating}
            />
          </div>

          {settings && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Taxa de ativação:</span>
                  <span className="font-medium">R$ {settings.activation_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mensalidade:</span>
                  <span className="font-medium">R$ {settings.monthly_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-primary">
                  <span>Valor pro-rata (este mês):</span>
                  <span className="font-medium">R$ {getProratedValue()}</span>
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
                <TableHead>Plano</TableHead>
                <TableHead>Criação</TableHead>
                <TableHead className="text-right">Valor Mensal</TableHead>
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
                filteredCompanies.map(c => {
                  const planStatus = getPlanStatus(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.slug}</TableCell>
                      <TableCell>
                        <Badge variant={planStatus.variant}>{planStatus.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        R$ {(settings?.monthly_fee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {c.plan && !c.plan.active && (
                            <Button variant="default" size="sm" className="gap-1" onClick={() => activateTrial(c.id)}>
                              <Play className="w-3 h-3" />
                              Trial 14d
                            </Button>
                          )}
                          {c.plan && c.plan.active && (
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => toggleCompanyPlan(c.id, true)}>
                              <Pause className="w-3 h-3" />
                              Pausar
                            </Button>
                          )}
                          <Button variant="secondary" size="sm" className="gap-1" onClick={() => handleAccess(c.id)}>
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
      </div>
    </ResellerLayout>
  );
}
