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
  FileText, Loader2, RefreshCw, Search, CheckCircle, XCircle, 
  Clock, AlertTriangle, Ban, Eye, Copy, RotateCcw, X, Printer 
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { consultarNFCe, cancelarNFCe, reprocessarNFCe, getDanfeNFCe, printDanfe } from '@/services/nfceService';

interface NFCeRecord {
  id: string;
  company_id: string;
  sale_id: string | null;
  external_id: string;
  nfce_id: string | null;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  status: string;
  ambiente: string | null;
  valor_total: number;
  qrcode_url: string | null;
  motivo_rejeicao: string | null;
  xml_url: string | null;
  created_at: string;
  updated_at: string;
  request_payload: any;
  response_payload: any;
  webhook_payload: any;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  processando: { label: 'Processando', icon: Loader2, className: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  autorizada: { label: 'Autorizada', icon: CheckCircle, className: 'bg-green-500/15 text-green-700 border-green-500/30' },
  rejeitada: { label: 'Rejeitada', icon: XCircle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelada: { label: 'Cancelada', icon: Ban, className: 'bg-muted text-muted-foreground border-border' },
  denegada: { label: 'Denegada', icon: AlertTriangle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export default function NFCeMonitor() {
  const { company } = useAuthContext();
  const [records, setRecords] = useState<NFCeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<NFCeRecord | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const recordsRef = useRef<NFCeRecord[]>([]);

  const loadRecords = useCallback(async () => {
    if (!company?.id) return;
    try {
      let query = supabase
        .from('nfce_records')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      const recs = (data as unknown as NFCeRecord[]) || [];
      setRecords(recs);
      recordsRef.current = recs;
    } catch (error) {
      console.error('Erro ao carregar NFC-e:', error);
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company?.id, statusFilter]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Auto-consult pending records every 10 seconds to sync status from API
  useEffect(() => {
    if (!company?.id) return;

    async function consultAndRefresh() {
      const pending = recordsRef.current.filter(r => 
        (r.status === 'pendente' || r.status === 'processando') && r.nfce_id
      );
      
      for (const record of pending.slice(0, 5)) {
        try {
          await consultarNFCe(company!.id, record.nfce_id!);
        } catch (e) {
          console.error('[NFCeMonitor] Consult error:', record.nfce_id, e);
        }
      }
      
      await loadRecords();
    }

    // Initial consult after 2s
    const timeout = setTimeout(consultAndRefresh, 2000);
    // Then every 10s
    const interval = setInterval(consultAndRefresh, 10000);

    return () => { 
      clearTimeout(timeout);
      clearInterval(interval); 
    };
  }, [company?.id, loadRecords]);

  function handleRefresh() {
    setRefreshing(true);
    loadRecords();
  }

  async function handleConsultar(record: NFCeRecord) {
    if (!company?.id || !record.nfce_id) return;
    setActionLoading(record.id);
    try {
      await consultarNFCe(company.id, record.nfce_id);
      toast.success('Consulta realizada');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao consultar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReprocessar(record: NFCeRecord) {
    if (!company?.id || !record.nfce_id) return;
    setActionLoading(record.id);
    try {
      await reprocessarNFCe(company.id, record.nfce_id);
      toast.success('Reprocessamento solicitado');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reprocessar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelar(record: NFCeRecord) {
    if (!company?.id || !record.nfce_id) return;
    const justificativa = prompt('Informe a justificativa do cancelamento (mín. 15 caracteres):');
    if (!justificativa || justificativa.length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres');
      return;
    }
    setActionLoading(record.id);
    try {
      await cancelarNFCe(company.id, record.nfce_id, justificativa);
      toast.success('Cancelamento solicitado');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePrintDanfe(record: NFCeRecord) {
    if (!company?.id || !record.nfce_id) return;
    setActionLoading(record.id);
    try {
      const danfeResult = await getDanfeNFCe(company.id, record.nfce_id);
      printDanfe(danfeResult);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao imprimir DANFE');
    } finally {
      setActionLoading(null);
    }
  }

  const filteredRecords = records.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.external_id?.toLowerCase().includes(term) ||
      r.numero?.toLowerCase().includes(term) ||
      r.chave_acesso?.toLowerCase().includes(term) ||
      r.protocolo?.toLowerCase().includes(term)
    );
  });

  // Stats
  const stats = {
    total: records.length,
    autorizadas: records.filter(r => r.status === 'autorizada').length,
    pendentes: records.filter(r => r.status === 'pendente' || r.status === 'processando').length,
    rejeitadas: records.filter(r => r.status === 'rejeitada').length,
  };

  if (loading) {
    return (
      <AppLayout title="NFC-e Monitor">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="NFC-e Monitor" actions={
      <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    }>
      <div className="space-y-6">
        {/* Stats Cards */}
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

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ID, número, chave de acesso..."
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
                  <SelectItem value="processando">Processando</SelectItem>
                  <SelectItem value="autorizada">Autorizada</SelectItem>
                  <SelectItem value="rejeitada">Rejeitada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                  <SelectItem value="denegada">Denegada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Records Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Notas Fiscais ({filteredRecords.length})
            </CardTitle>
            <CardDescription>
              Monitoramento em tempo real das NFC-e emitidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRecords.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {records.length === 0 ? 'Nenhuma NFC-e emitida ainda' : 'Nenhum registro encontrado com os filtros aplicados'}
                </p>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Externo</TableHead>
                      <TableHead>Número</TableHead>
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

                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-xs">{record.external_id}</TableCell>
                          <TableCell>{record.numero || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 ${statusCfg.className}`}>
                              <StatusIcon className={`w-3 h-3 ${record.status === 'processando' ? 'animate-spin' : ''}`} />
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {record.ambiente === 'producao' ? 'Produção' : 'Homologação'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            R$ {Number(record.valor_total).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(record.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setSelectedRecord(record)}
                                title="Detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {record.status === 'rejeitada' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-blue-600"
                                  onClick={() => handleReprocessar(record)}
                                  disabled={isLoading}
                                  title="Reprocessar"
                                >
                                  <RotateCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </Button>
                              )}
                              {record.status === 'autorizada' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-primary"
                                    onClick={() => handlePrintDanfe(record)}
                                    disabled={isLoading}
                                    title="Imprimir DANFE"
                                  >
                                    <Printer className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => handleCancelar(record)}
                                    disabled={isLoading}
                                    title="Cancelar"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Detalhes da NFC-e</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <ScrollArea className="max-h-[70vh] pr-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">ID Externo</span>
                    <p className="font-mono font-medium">{selectedRecord.external_id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="mt-1">
                      <Badge variant="outline" className={STATUS_CONFIG[selectedRecord.status]?.className || ''}>
                        {STATUS_CONFIG[selectedRecord.status]?.label || selectedRecord.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Número</span>
                    <p className="font-medium">{selectedRecord.numero || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Série</span>
                    <p className="font-medium">{selectedRecord.serie || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor Total</span>
                    <p className="font-medium">R$ {Number(selectedRecord.valor_total).toFixed(2)}</p>
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
                          onClick={() => {
                            navigator.clipboard.writeText(selectedRecord.chave_acesso!);
                            toast.success('Chave copiada!');
                          }}
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

                {selectedRecord.motivo_rejeicao && (
                  <>
                    <Separator />
                    <div className="bg-destructive/10 p-3 rounded-lg">
                      <span className="text-sm font-medium text-destructive">Motivo da Rejeição</span>
                      <p className="text-sm mt-1">{selectedRecord.motivo_rejeicao}</p>
                    </div>
                  </>
                )}

                {selectedRecord.qrcode_url && (
                  <div>
                    <span className="text-sm text-muted-foreground">QR Code URL</span>
                    <a href={selectedRecord.qrcode_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline block mt-1 break-all">
                      {selectedRecord.qrcode_url}
                    </a>
                  </div>
                )}

                {selectedRecord.xml_url && (
                  <div>
                    <span className="text-sm text-muted-foreground">XML</span>
                    <a href={selectedRecord.xml_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline block mt-1">
                      Download XML
                    </a>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
