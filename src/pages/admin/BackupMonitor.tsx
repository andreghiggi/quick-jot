import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, CheckCircle2, XCircle, Loader2, Play, Database } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BackupRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  tables_processed: number;
  rows_copied: number;
  error_message: string | null;
  details: any;
}

export default function BackupMonitor() {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [selectedRun, setSelectedRun] = useState<BackupRun | null>(null);

  const fetchRuns = async () => {
    try {
      const { data, error } = await supabase
        .from('backup_runs' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      const dataRows = (data || []) as unknown as BackupRun[];
      setRuns(dataRows);
      
      // Update selected run if it's currently running or was just selected
      if (selectedRun) {
        const updated = dataRows.find(r => r.id === selectedRun.id);
        if (updated) setSelectedRun(updated);
      } else if (dataRows.length > 0 && dataRows[0].status === 'running') {
        setSelectedRun(dataRows[0]);
      }

    } catch (error) {
      console.error('Error fetching backup runs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [selectedRun?.id]);

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-mirror', {
        body: { skip_auth: true }
      });

      if (error) throw error;
      toast.success('Backup iniciado com sucesso!');
      fetchRuns();
    } catch (error: any) {
      console.error('Error triggering backup:', error);
      toast.error('Erro ao iniciar backup: ' + error.message);
    } finally {
      setTriggering(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600 gap-1"><CheckCircle2 className="w-3 h-3" /> Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Erro</Badge>;
      case 'running':
        return <Badge variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600 animate-pulse gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Rodando</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Estimativa baseada no total conhecido de ~77 tabelas
  const TOTAL_TABLES_ESTIMATE = 77;
  
  return (
    <AppLayout title="Monitoramento Backup Mirror">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Status do Espelhamento Externo
            </h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe a sincronização de dados entre o banco de produção e o espelho de backup.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchRuns} 
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button 
              size="sm" 
              onClick={handleTriggerBackup} 
              disabled={triggering}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Iniciar Agora (Public)
            </Button>
          </div>
        </div>

        {selectedRun && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-md">Execução em Destaque: {selectedRun.id.slice(0, 8)}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Iniciado em: {format(new Date(selectedRun.started_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
                {getStatusBadge(selectedRun.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso das Tabelas</span>
                  <span className="font-medium">{selectedRun.tables_processed} / {TOTAL_TABLES_ESTIMATE}</span>
                </div>
                <Progress 
                  value={Math.min(100, (selectedRun.tables_processed / TOTAL_TABLES_ESTIMATE) * 100)} 
                  className="h-2"
                />
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-background p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Linhas Copiadas</p>
                  <p className="text-xl font-bold">{selectedRun.rows_copied.toLocaleString()}</p>
                </div>
                <div className="bg-background p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Tabelas Processadas</p>
                  <p className="text-xl font-bold">{selectedRun.tables_processed}</p>
                </div>
                <div className="bg-background p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Duração</p>
                  <p className="text-sm font-mono mt-1">
                    {selectedRun.finished_at 
                      ? `${Math.round((new Date(selectedRun.finished_at).getTime() - new Date(selectedRun.started_at).getTime()) / 1000)}s`
                      : 'Em andamento...'}
                  </p>
                </div>
                <div className="bg-background p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Tabelas Restantes</p>
                  <p className="text-xl font-bold">{Math.max(0, TOTAL_TABLES_ESTIMATE - selectedRun.tables_processed)}</p>
                </div>
              </div>

              {selectedRun.error_message && (
                <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg text-xs text-destructive flex gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span className="break-all">{selectedRun.error_message}</span>
                </div>
              )}

              {selectedRun.details && typeof selectedRun.details === 'object' && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold mb-2">Últimas Tabelas Processadas:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(selectedRun.details)
                      .reverse()
                      .slice(0, 12)
                      .map(([table, detail]: [string, any]) => (
                        <div key={table} className="text-[10px] bg-background border p-2 rounded flex justify-between items-center">
                          <span className="font-medium truncate mr-2">{table}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{detail.rows} rows</span>
                            {detail.error ? (
                              <XCircle className="w-3 h-3 text-destructive" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            )}
                          </div>
                        </div>
                      ))}

                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Execuções</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tabelas</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma execução encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((run) => (
                      <TableRow key={run.id} className={selectedRun?.id === run.id ? 'bg-muted/50' : ''}>
                        <TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(run.started_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(run.status)}
                        </TableCell>
                        <TableCell className="text-right font-medium">{run.tables_processed}</TableCell>
                        <TableCell className="text-right">{run.rows_copied.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedRun(run)}
                          >
                            Detalhes
                          </Button>
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
