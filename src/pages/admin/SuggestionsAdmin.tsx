import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Building2, Calendar, Check, X, Clock } from 'lucide-react';

interface SuggestionWithCompany {
  id: string;
  company_id: string;
  title: string;
  description: string;
  status: string;
  admin_notes: string | null;
  expected_date: string | null;
  created_at: string;
  company?: { name: string } | null;
}

export default function SuggestionsAdmin() {
  const [suggestions, setSuggestions] = useState<SuggestionWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestionWithCompany | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchSuggestions();
  }, []);

  async function fetchSuggestions() {
    try {
      const { data, error } = await supabase
        .from('suggestions')
        .select('*, company:companies(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSuggestions((data || []).map(d => ({
        ...d,
        company: Array.isArray(d.company) ? d.company[0] : d.company,
      })));
    } catch {
      toast.error('Erro ao carregar sugestões');
    } finally {
      setLoading(false);
    }
  }

  function openEdit(s: SuggestionWithCompany) {
    setEditingSuggestion(s);
    setAdminNotes(s.admin_notes || '');
    setNewStatus(s.status);
    setExpectedDate(s.expected_date || '');
  }

  async function handleSave() {
    if (!editingSuggestion) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('suggestions')
        .update({
          status: newStatus,
          admin_notes: adminNotes || null,
          expected_date: expectedDate || null,
        })
        .eq('id', editingSuggestion.id);
      if (error) throw error;
      toast.success('Sugestão atualizada!');
      setEditingSuggestion(null);
      fetchSuggestions();
    } catch {
      toast.error('Erro ao atualizar');
    } finally {
      setIsSaving(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending': return <Badge variant="secondary">Pendente</Badge>;
      case 'approved': return <Badge variant="default">Aprovada</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejeitada</Badge>;
      case 'implemented': return <Badge className="bg-primary text-primary-foreground">Implementada</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  const filtered = filterStatus === 'all' 
    ? suggestions 
    : suggestions.filter(s => s.status === filterStatus);

  if (loading) {
    return (
      <AppLayout title="Sugestões - Admin">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const headerActions = (
    <Select value={filterStatus} onValueChange={setFilterStatus}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas ({suggestions.length})</SelectItem>
        <SelectItem value="pending">Pendentes ({suggestions.filter(s => s.status === 'pending').length})</SelectItem>
        <SelectItem value="approved">Aprovadas ({suggestions.filter(s => s.status === 'approved').length})</SelectItem>
        <SelectItem value="implemented">Implementadas ({suggestions.filter(s => s.status === 'implemented').length})</SelectItem>
        <SelectItem value="rejected">Rejeitadas ({suggestions.filter(s => s.status === 'rejected').length})</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <AppLayout title="Gestão de Sugestões" actions={headerActions}>
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhuma sugestão encontrada
            </CardContent>
          </Card>
        ) : (
          filtered.map((s) => (
            <Card key={s.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => openEdit(s)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Building2 className="w-3 h-3" />
                      {s.company?.name || 'Empresa desconhecida'}
                      <span>•</span>
                      {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.expected_date && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(s.expected_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    )}
                    {getStatusBadge(s.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                {s.admin_notes && (
                  <p className="text-sm mt-2 bg-muted p-2 rounded"><strong>Nota:</strong> {s.admin_notes}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingSuggestion} onOpenChange={(open) => !open && setEditingSuggestion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Sugestão</DialogTitle>
          </DialogHeader>
          {editingSuggestion && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-medium">{editingSuggestion.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{editingSuggestion.description}</p>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {editingSuggestion.company?.name}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">
                      <span className="flex items-center gap-2"><Clock className="w-3 h-3" /> Pendente</span>
                    </SelectItem>
                    <SelectItem value="approved">
                      <span className="flex items-center gap-2"><Check className="w-3 h-3" /> Aprovada</span>
                    </SelectItem>
                    <SelectItem value="rejected">
                      <span className="flex items-center gap-2"><X className="w-3 h-3" /> Rejeitada</span>
                    </SelectItem>
                    <SelectItem value="implemented">
                      <span className="flex items-center gap-2"><Check className="w-3 h-3" /> Implementada</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Previsão de Implementação</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas do Admin</Label>
                <Textarea
                  placeholder="Resposta ou observação para a empresa..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSuggestion(null)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
