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
  Clock, AlertTriangle, Ban, Eye, Copy, RotateCcw, X, Printer, MoreVertical, Download, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { consultarNFe, cancelarNFe, enviarCceNFe, reprocessarNFe, baixarXmlNFe } from '@/services/nfeService';
import { nfeDanfeFromXml, openNfeDanfe } from '@/lib/nfeDanfe';

interface NFeRecord {
  id: string;
  company_id: string;
  external_id: string;
  nfe_id: string | null;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  status: string;
  ambiente: string | null;
  valor_total: number;
  destinatario: any;
  motivo_rejeicao: string | null;
  request_payload: any;
  cce_history: Array<{ sequencia: number; correcao: string; created_at: string }> | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  rascunho: { label: 'Rascunho', icon: FileText, className: 'bg-muted text-muted-foreground border-border' },
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  autorizada: { label: 'Autorizada', icon: CheckCircle, className: 'bg-green-500/15 text-green-700 border-green-500/30' },
  rejeitada: { label: 'Rejeitada', icon: XCircle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelada: { label: 'Cancelada', icon: Ban, className: 'bg-muted text-muted-foreground border-border' },
  denegada: { label: 'Denegada', icon: AlertTriangle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export default function NFeMonitor() {
  const { company } = useAuthContext();
  const [records, setRecords] = useState<NFeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<NFeRecord | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const recordsRef = useRef<NFeRecord[]>([]);

  const loadRecords = useCallback(async () => {
    if (!company?.id) return;
    try {
      let query = supabase
        .from('nfe_records')
        .select('*')
        .eq('company_id', company.id)
        .not('status', 'in', '(rascunho,excluida)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      const recs = (data as unknown as NFeRecord[]) || [];
      setRecords(recs);
      recordsRef.current = recs;
    } catch (error) {
      console.error('Erro ao carregar NF-e:', error);
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company?.id, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Consulta automática das pendentes a cada 10s, pra sincronizar o status
  // final (autorizada/rejeitada) assim que o webhook ou a consulta resolver.
  useEffect(() => {
    if (!company?.id) return;

    async function consultAndRefresh() {
      const pending = recordsRef.current.filter(r => r.nfe_id && r.status === 'pendente');
      for (const record of pending.slice(0, 5)) {
        try {
          await consultarNFe(company!.id, record.nfe_id!);
        } catch (e) {
          console.error('[NFeMonitor] Consult error:', record.nfe_id, e);
        }
      }
      await loadRecords();
    }

    const timeout = setTimeout(consultAndRefresh, 2000);
    const interval = setInterval(consultAndRefresh, 10000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [company?.id, loadRecords]);

  function handleRefresh() {
    setRefreshing(true);
    loadRecords();
  }

  async function handleConsultar(record: NFeRecord) {
    if (!company?.id || !record.nfe_id) return;
    setActionLoading(record.id);
    try {
      await consultarNFe(company.id, record.nfe_id);
      toast.success('Consulta realizada');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao consultar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReprocessar(record: NFeRecord) {
    if (!company?.id) return;
    setActionLoading(record.id);
    try {
      await reprocessarNFe(company.id, record.id, record.request_payload);
      toast.info('Retransmissão solicitada. Aguardando retorno...');

      let attempts = 0;
      const maxAttempts = 10;
      const poll = async (): Promise<void> => {
        attempts++;
        const { data } = await supabase.from('nfe_records').select('*').eq('id', record.id).maybeSingle();
        if (data) {
          if (data.status === 'autorizada') {
            toast.success('NF-e autorizada com sucesso!');
            setActionLoading(null);
            loadRecords();
            return;
          }
          if (data.status === 'rejeitada' || data.status === 'denegada') {
            toast.error(`NF-e ${data.status}: ${data.motivo_rejeicao || 'Verifique os detalhes'}`);
            setActionLoading(null);
            loadRecords();
            return;
          }
        }
        if (attempts < maxAttempts) setTimeout(poll, 4000);
        else { toast.warning('Tempo de espera esgotado. Verifique o status manualmente.'); setActionLoading(null); loadRecords(); }
      };
      setTimeout(poll, 3000);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao retransmitir');
      setActionLoading(null);
    }
  }

  async function handleCancelar(record: NFeRecord) {
    if (!company?.id || !record.nfe_id) return;
    const justificativa = prompt('Informe a justificativa do cancelamento (15 a 1000 caracteres). O prazo de cancelamento é o da SEFAZ (em geral 24h após a autorização):');
    if (!justificativa || justificativa.trim().length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres');
      return;
    }
    setActionLoading(record.id);
    try {
      await cancelarNFe(company.id, record.id, record.nfe_id, justificativa.trim());
      toast.success('Cancelamento solicitado');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCce(record: NFeRecord) {
    if (!company?.id || !record.nfe_id) return;
    const correcao = prompt('Texto da carta de correção (15 a 1000 caracteres). Não corrige valores, impostos, dados do destinatário que mudem o imposto, data de emissão nem quantidades:');
    if (!correcao || correcao.trim().length < 15) {
      toast.error('Texto deve ter pelo menos 15 caracteres');
      return;
    }
    setActionLoading(record.id);
    try {
      await enviarCceNFe(company.id, record.id, record.nfe_id, correcao.trim());
      toast.success('Carta de correção registrada na SEFAZ');
      loadRecords();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar carta de correção');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePrintDanfe(record: NFeRecord) {
    if (!company?.id || !record.nfe_id) return;
    setActionLoading(record.id);
    try {
      const xml = await baixarXmlNFe(company.id, record.nfe_id);
      openNfeDanfe(nfeDanfeFromXml(xml));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao imprimir DANFE');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownloadXml(record: NFeRecord) {
    if (!company?.id || !record.nfe_id) return;
    setActionLoading(record.id);
    try {
      const text = await baixarXmlNFe(company.id, record.nfe_id);
      const blob = new Blob([text], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const name = record.chave_acesso || `nfe-${record.serie ?? 'X'}-${record.numero ?? record.id.slice(0, 8)}`;
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
      r.external_id?.toLowerCase().includes(term) ||
      r.numero?.toLowerCase().includes(term) ||
      r.chave_acesso?.toLowerCase().includes(term) ||
      r.protocolo?.toLowerCase().includes(term) ||
      r.destinatario?.razao_social?.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: records.length,
    autorizadas: records.filter(r => r.status === 'autorizada').length,
    pendentes: records.filter(r => r.status === 'pendente').length,
    rejeitadas: records.filter(r => r.status === 'rejeitada').length,
  };

  if (loading) {
    return (
      <AppLayout title="NF-e Monitor">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="NF-e Monitor" actions={
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
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ID, número, chave de acesso, destinatário..."
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
                  <SelectItem value="autorizada">Autorizada</SelectItem>
                  <SelectItem value="rejeitada">Rejeitada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                  <SelectItem value="denegada">Denegada</SelectItem>
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
              Notas Fiscais ({filteredRecords.length})
            </CardTitle>
            <CardDescription>
              Monitoramento em tempo real das NF-e (modelo 55) emitidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRecords.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {records.length === 0 ? 'Nenhuma NF-e emitida ainda' : 'Nenhum registro encontrado com os filtros aplicados'}
                </p>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Destinatário</TableHead>
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
                          <TableCell className="font-mono">{record.numero || '—'}/{record.serie || '—'}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={record.destinatario?.razao_social}>
                            {record.destinatario?.razao_social || record.destinatario?.cnpj || record.destinatario?.cpf || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 ${statusCfg.className}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusCfg.label}
                            </Badge>
                            {(record.cce_history?.length ?? 0) > 0 && (
                              <Badge variant="outline" className="ml-1 text-[10px]" title="Tem carta de correção">
                                CC-e {record.cce_history!.length}
                              </Badge>
                            )}
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
                              {(record.status === 'rejeitada' || record.status === 'pendente') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-blue-600"
                                  onClick={() => record.status === 'pendente' ? handleConsultar(record) : handleReprocessar(record)}
                                  disabled={isLoading}
                                  title={record.status === 'pendente' ? 'Consultar' : 'Retransmitir'}
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
                                  <DropdownMenuItem onClick={() => handlePrintDanfe(record)} disabled={record.status !== 'autorizada'}>
                                    <Printer className="h-4 w-4 mr-2" /> Imprimir DANFE
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSelectedRecord(record)}>
                                    <Eye className="h-4 w-4 mr-2" /> Detalhes
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleCce(record)} disabled={record.status !== 'autorizada'}>
                                    <MessageSquare className="h-4 w-4 mr-2" /> Carta de correção
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleCancelar(record)}
                                    disabled={record.status !== 'autorizada'}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <X className="h-4 w-4 mr-2" /> Cancelar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDownloadXml(record)} disabled={record.status !== 'autorizada'}>
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
            <DialogTitle>Detalhes da NF-e</DialogTitle>
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
                    <span className="text-muted-foreground">Número / Série</span>
                    <p className="font-medium">{selectedRecord.numero || '—'} / {selectedRecord.serie || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor Total</span>
                    <p className="font-medium">R$ {Number(selectedRecord.valor_total).toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Destinatário</span>
                    <p className="font-medium">{selectedRecord.destinatario?.razao_social || '—'}</p>
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

                {selectedRecord.motivo_rejeicao && (
                  <>
                    <Separator />
                    <div className="bg-destructive/10 p-3 rounded-lg">
                      <span className="text-sm font-medium text-destructive">Motivo da Rejeição</span>
                      <p className="text-sm mt-1">{selectedRecord.motivo_rejeicao}</p>
                    </div>
                  </>
                )}

                {(selectedRecord.cce_history?.length ?? 0) > 0 && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-sm font-medium">Histórico de Carta de Correção</span>
                      <div className="space-y-2 mt-2">
                        {selectedRecord.cce_history!.map((h) => (
                          <div key={h.sequencia} className="text-sm bg-muted p-2 rounded">
                            <div className="text-xs text-muted-foreground">
                              Sequência {h.sequencia} — {format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </div>
                            <div>{h.correcao}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {(() => {
                  const itens: any[] = Array.isArray(selectedRecord.request_payload?.itens) ? selectedRecord.request_payload.itens : [];
                  if (itens.length === 0) return null;
                  const num = (v: any) => Number(v ?? 0);
                  return (
                    <>
                      <Separator />
                      <div>
                        <span className="text-sm font-medium">Itens da nota ({itens.length})</span>
                        <div className="border rounded-lg overflow-hidden mt-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10">#</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Qtd</TableHead>
                                <TableHead className="text-right">Vl. Unit</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>CFOP</TableHead>
                                <TableHead>NCM</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {itens.map((it: any, idx: number) => {
                                const qtd = num(it.quantidade);
                                const vUnit = num(it.valor_unitario);
                                const vTotal = num(it.valor_total ?? qtd * vUnit);
                                return (
                                  <TableRow key={idx}>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell className="max-w-[220px] truncate" title={it.descricao}>{it.descricao || '—'}</TableCell>
                                    <TableCell className="text-right">{qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</TableCell>
                                    <TableCell className="text-right">R$ {vUnit.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">R$ {vTotal.toFixed(2)}</TableCell>
                                    <TableCell className="font-mono text-xs">{it.cfop || '—'}</TableCell>
                                    <TableCell className="font-mono text-xs">{it.ncm || '—'}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver JSON completo do payload</summary>
                          <pre className="text-[10px] bg-muted p-2 rounded mt-1 overflow-auto max-h-64">{JSON.stringify(selectedRecord.request_payload, null, 2)}</pre>
                        </details>
                      </div>
                    </>
                  );
                })()}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
