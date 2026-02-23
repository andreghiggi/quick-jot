import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Lightbulb, Loader2, Calendar, MessageSquare } from 'lucide-react';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  status: string;
  admin_notes: string | null;
  expected_date: string | null;
  created_at: string;
}

export default function Suggestions() {
  const { company } = useAuthContext();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (company?.id) fetchSuggestions();
  }, [company?.id]);

  async function fetchSuggestions() {
    try {
      const { data, error } = await supabase
        .from('suggestions')
        .select('*')
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSuggestions(data || []);
    } catch {
      toast.error('Erro ao carregar sugestões');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast.error('Preencha título e descrição');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('suggestions').insert({
        company_id: company!.id,
        title: title.trim(),
        description: description.trim(),
      });
      if (error) throw error;
      toast.success('Sugestão enviada com sucesso!');
      setTitle('');
      setDescription('');
      setIsDialogOpen(false);
      fetchSuggestions();
    } catch {
      toast.error('Erro ao enviar sugestão');
    } finally {
      setIsSubmitting(false);
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

  if (loading) {
    return (
      <AppLayout title="Sugestões">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const headerActions = (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Sugestão</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Sugestão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              placeholder="Ex: Relatório de vendas por período"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Textarea
              placeholder="Descreva sua sugestão de melhoria ou implementação..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar Sugestão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppLayout title="Sugestões de Melhoria" actions={headerActions}>
      <div className="space-y-4">
        {suggestions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma sugestão ainda</h3>
              <p className="text-muted-foreground mb-4">
                Envie suas ideias de melhoria e acompanhe o status aqui
              </p>
              <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Enviar Sugestão
              </Button>
            </CardContent>
          </Card>
        ) : (
          suggestions.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  {getStatusBadge(s.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{s.description}</p>
                {s.admin_notes && (
                  <div className="bg-muted p-3 rounded-lg text-sm">
                    <div className="flex items-center gap-1 font-medium mb-1">
                      <MessageSquare className="w-3 h-3" />
                      Resposta da equipe:
                    </div>
                    <p>{s.admin_notes}</p>
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Enviada em {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                  {s.expected_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Previsão: {format(new Date(s.expected_date), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppLayout>
  );
}
