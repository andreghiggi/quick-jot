import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { 
  Building2, 
  Plus, 
  Loader2, 
  ExternalLink,
  Search
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export default function AdminDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // New company form
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanySlug, setNewCompanySlug] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
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
        });

      if (error) throw error;

      toast.success('Empresa criada com sucesso!');
      setIsDialogOpen(false);
      setNewCompanyName('');
      setNewCompanySlug('');
      setNewCompanyPhone('');
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
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma empresa encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCompanies.map((comp) => (
                      <TableRow key={comp.id}>
                        <TableCell className="font-medium">{comp.name}</TableCell>
                        <TableCell className="text-muted-foreground">{comp.slug}</TableCell>
                        <TableCell>{comp.phone || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={comp.active ? 'default' : 'secondary'}>
                            {comp.active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/admin/empresa/${comp.id}/modulos`}>
                              <Button variant="outline" size="sm" className="gap-1">
                                <ExternalLink className="w-3 h-3" />
                                Módulos
                              </Button>
                            </Link>
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
    </AppLayout>
  );
}
