import { useState, useEffect, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  FileText, Loader2, RefreshCw, Search, CheckCircle, XCircle,
  Clock, Ban, Eye, Copy, RotateCcw, X, Printer, MoreVertical, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface NfseRecord {
  id: string;
  company_id: string;
  api_id: string | null;
  numero_nfse: string | null;
  numero_dps: string | null;
  serie: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  status: string;
  ambiente: string | null;
  valor_servicos: number;
  tomador: any;
  servico: any;
  motivo_retorno: string | null;
  request_payload: any;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  processada: { label: 'Processando', icon: Clock, className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  autorizada: { label: 'Autorizada', icon: CheckCircle, className: 'bg-green-500/15 text-green-700 border-green-500/30' },
  rejeitada: { label: 'Rejeitada', icon: XCircle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelada: { label: 'Cancelada', icon: Ban, className: 'bg-muted text-muted-foreground border-border' },
};

function base64ToBlob(b64: string, mime: string): Blob {
  const byteChars = atob(b64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}

export default function NfseMonitor() {
  const { company } = useAuthContext();
  const [records, setRecords] = useState<NfseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<NfseRecord | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const recordsRef = useRef<NfseRecord[]>([]);

  const loadRecords = useCallback(async () => {
    if (!company?.id) return;
    try {
      let query = (supabase as any)
        .from('nfse_records')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      const recs = (data as unknown as NfseRecord[]) || [];
      setRecords(recs);
      recordsRef.current = recs;
    } catch (error) {
      console.error('Erro ao carregar NFS-e:', error);
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company?.id, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  async function invoke(action: string, recordId: string, payload?: any) {
    if (!company?.id) return null;
    const { data, error } = await supabase.functions.invoke('nfse-proxy', {
      body: { action, companyId: company.id, recordId, payload },
    });
    if (error) throw error;
    return data;
  }

  // Consulta automática das pendentes/processando a cada 10s.
  useEffect(() => {
    if (!company?.id) return;

    async function consultAndRefresh() {
      const pending = recordsRef.current.filter(r => ['pendente', 'processada'].includes(r.status));
      for (const record of pending.slice(0, 5)) {
        try {
          await invoke('consultar', record.id);
        } catch (e) {
          console.error('[NfseMonitor] Consult error:', record.id, e);
        }
      }
      await loadRecords();
    }

    const timeout = setTimeout(consultAndRefresh, 2000);
    const interval = setInterval(consultAndRefresh, 10000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, loadRecords]);

  function handleRefresh() {
    setRefreshing(true);
    loadRecords();
  }

  async function handleConsultar(record: NfseRecord) {
    setActionLoading(record.id);
    try {
      const data = await invoke('consultar', record.id);
      if (data?.success === false) { toast.error(data?.error || 'Falha na consulta'); return; }
      toast.success('Status atualizado.');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao consultar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelar(record: NfseRecord) {
    const justificativa = prompt('Informe a justificativa do cancelamento (mínimo 15 caracteres):');
    if (!justificativa || justificativa.trim().length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres');
      return;
    }
    setActionLoading(record.id);
    try {
      const data = await invoke('cancelar', record.id, { justificativa: justificativa.trim(), motivo: 1 });
      if (data?.success === false) { toast.error(data?.error || 'Falha ao cancelar'); return; }
      toast.success('NFS-e cancelada.');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleImprimir(record: NfseRecord) {
    setActionLoading(record.id);
    try {
      const data = await invoke('pdf', record.id);
      if (!data?.pdf_base64) { toast.error(data?.error || 'Falha ao gerar o PDF da NFS-e'); return; }
      const blob = base64ToBlob(data.pdf_base64, 'application/pdf');
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) { toast.error('Pop-up bloqueado. Permita pop-ups para imprimir.'); return; }
      win.addEventListener('load', () => { try { win.print(); } catch { /* o viewer nativo do navegador já tem botão de imprimir */ } });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao imprimir NFS-e');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownloadXml(record: NfseRecord) {
    setActionLoading(record.id);
    try {
      const data = await invoke('xml', record.id);
      if (!data?.xml_base64) { toast.error(data?.error || 'Falha ao baixar XML'); return; }
      const bin = atob(data.xml_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = new TextDecoder('utf-8').decode(bytes);
      const blob = new Blob([text], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const name = record.chave_acesso || `nfse-${record.serie ?? 'X'}-${record.numero_nfse ?? record.id.slice(0, 8)}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao baixar XML');
    } finally {
      setActionLoading(null);
    }
  }

  const filteredRecords = records.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.numero_nfse?.toLowerCase().includes(term) ||
      r.numero_dps?.toLowerCase().includes(term) ||
      r.chave_acesso?.toLowerCase().includes(term) ||
      r.protocolo?.toLowerCase().includes(term) ||
      r.tomador?.nome?.toLowerCase().includes(term) ||
      r.tomador?.documento?.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: records.length,
    autorizadas: records.filter(r => r.status === 'autorizada' || r.status === 'processada').length,
    pendentes: records.filter(r => r.status === 'pendente').length,
    rejeitadas: records.filter(r => r.status === 'rejeitada').length,
  };

  if (loading) {
    return (
      <AppLayout title="NFS-e Monitor">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="NFS-e Monitor" actions={
      <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    }>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total emitidas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{stats.autorizadas}</div>
              <p className="text-xs text-muted-foreground">Autorizadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.pendentes}</div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-destructive">{stats.rejeitadas}</div>
              <p className="text-xs text-muted-foreground">Rejeitadas</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número, chave de acesso, tomador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="processada">Processando</SelectItem>
                  <SelectItem value="autorizada">Autorizada</SelectItem>
                  <SelectItem value="rejeitada">Rejeitada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input type="date" aria-label="De" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-auto" />
                <span className="text-sm text-muted-foreground">até</span>
                <Input type="date" aria-label="Até" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-auto" />
              </div>
              {(statusFilter !== 'all' || dateFrom || dateTo || searchTerm) && (
                <Button variant="ghost" onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setSearchTerm(''); }}>Limpar filtros</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Notas de Serviço ({filteredRecords.length})
            </CardTitle>
            <CardDescription>
              Monitoramento em tempo real das NFS-e (padrão nacional SEFIN/ADN) emitidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRecords.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {records.length === 0 ? 'Nenhuma NFS-e emitida ainda' : 'Nenhum registro encontrado com os filtros aplicados'}
                </p>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Tomador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ambiente</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => {
                      const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.pendente;
                      const StatusIcon = statusCfg.icon;
                      const isLoading = actionLoading === record.id;
                      const podeImprimir = record.status === 'autorizada' || record.status === 'processada';

                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono">{record.numero_nfse || record.numero_dps || '—'}/{record.serie || '—'}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={record.tomador?.nome}>
                            {record.tomador?.nome || record.tomador?.documento || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 ${statusCfg.className}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {record.ambiente === 'producao' ? 'Produção' : 'Homologação'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            R$ {Number(record.valor_servicos).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(record.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {['pendente', 'processada'].includes(record.status) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-blue-600"
                                  onClick={() => handleConsultar(record)}
                                  disabled={isLoading}
                                  title="Consultar"
                                >
                                  <RotateCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading} aria-label="Ações">
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem onClick={() => handleImprimir(record)} disabled={!podeImprimir}>
                                    <Printer className="h-4 w-4 mr-2" /> Imprimir
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSelectedRecord(record)}>
                                    <Eye className="h-4 w-4 mr-2" /> Detalhes
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleCancelar(record)}
                                    disabled={record.status !== 'autorizada'}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <X className="h-4 w-4 mr-2" /> Cancelar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDownloadXml(record)} disabled={!podeImprimir}>
                                    <Download className="h-4 w-4 mr-2" /> Baixar XML
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Detalhes da NFS-e</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <ScrollArea className="max-h-[70vh] pr-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="mt-1">
                      <Badge variant="outline" className={STATUS_CONFIG[selectedRecord.status]?.className || ''}>
                        {STATUS_CONFIG[selectedRecord.status]?.label || selectedRecord.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Número / DPS / Série</span>
                    <p className="font-medium">{selectedRecord.numero_nfse || '—'} / {selectedRecord.numero_dps || '—'} / {selectedRecord.serie || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor dos Serviços</span>
                    <p className="font-medium">R$ {Number(selectedRecord.valor_servicos).toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tomador</span>
                    <p className="font-medium">{selectedRecord.tomador?.nome || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Documento do Tomador</span>
                    <p className="font-medium">{selectedRecord.tomador?.documento || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ambiente</span>
                    <p className="font-medium">{selectedRecord.ambiente === 'producao' ? 'Produção' : 'Homologação'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Criado em</span>
                    <p className="font-medium">{format(new Date(selectedRecord.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Atualizado em</span>
                    <p className="font-medium">{format(new Date(selectedRecord.updated_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                  </div>
                </div>

                {selectedRecord.servico?.discriminacao && (
                  <div>
                    <span className="text-sm text-muted-foreground">Descrição do serviço</span>
                    <p className="text-sm mt-1">{selectedRecord.servico.discriminacao}</p>
                  </div>
                )}

                {selectedRecord.chave_acesso && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-sm text-muted-foreground">Chave de Acesso</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{selectedRecord.chave_acesso}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => { navigator.clipboard.writeText(selectedRecord.chave_acesso!); toast.success('Chave copiada!'); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {selectedRecord.protocolo && (
                  <div>
                    <span className="text-sm text-muted-foreground">Protocolo</span>
                    <p className="font-mono text-sm">{selectedRecord.protocolo}</p>
                  </div>
                )}

                {selectedRecord.motivo_retorno && (
                  <>
                    <Separator />
                    <div className="bg-destructive/10 p-3 rounded-lg">
                      <span className="text-sm font-medium text-destructive">Motivo do Retorno</span>
                      <p className="text-sm mt-1">{selectedRecord.motivo_retorno}</p>
                    </div>
                  </>
                )}

                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver JSON completo do payload</summary>
                  <pre className="text-[10px] bg-muted p-2 rounded mt-1 overflow-auto max-h-64">{JSON.stringify(selectedRecord.request_payload, null, 2)}</pre>
                </details>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
