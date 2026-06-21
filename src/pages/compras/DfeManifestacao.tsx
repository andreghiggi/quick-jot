import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  RefreshCw, MoreVertical, Copy, Download, FileInput, Loader2,
  CheckCircle2, AlertCircle, Inbox, Search, ChevronRight,
} from 'lucide-react';

type Doc = {
  id: string;
  fiscalflow_id: string | null;
  chave_acesso: string;
  nsu: number | null;
  tipo: string;
  cnpj_emitente: string | null;
  nome_emitente: string | null;
  numero_nfe: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  tp_nf: number | null;
  situacao_nfe: string | null;
  status_manifestacao: string;
  data_manifestacao: string | null;
  xml_path: string | null;
  ignored: boolean;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  ciente: { label: 'Ciência', cls: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  confirmada: { label: 'Confirmada', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  desconhecida: { label: 'Desconhecida', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
  nao_realizada: { label: 'Não realizada', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
};

const TIPO_MANIFESTACAO = [
  { key: 'ciencia', label: 'Ciência da operação' },
  { key: 'confirmacao', label: 'Confirmação da operação' },
  { key: 'desconhecimento', label: 'Desconhecimento da operação', needsJust: true },
  { key: 'nao_realizada', label: 'Operação não realizada', needsJust: true },
] as const;

export default function DfeManifestacao() {
  const { company } = useAuthContext();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [manifestDialog, setManifestDialog] = useState<{ doc: Doc; tipo: string } | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => { if (company?.id) load(); }, [company?.id, statusFilter]);

  async function load() {
    if (!company?.id) return;
    setLoading(true);
    let q = supabase.from('dfe_documentos')
      .select('*')
      .eq('company_id', company.id)
      .eq('ignored', false)
      .order('data_emissao', { ascending: false, nullsFirst: false })
      .limit(500);
    if (statusFilter !== 'todos') q = q.eq('status_manifestacao', statusFilter);
    const { data, error } = await q;
    if (error) toast.error('Erro ao carregar: ' + error.message);
    setDocs((data as any) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return docs;
    return docs.filter(d =>
      (d.chave_acesso || '').toLowerCase().includes(s) ||
      (d.nome_emitente || '').toLowerCase().includes(s) ||
      (d.cnpj_emitente || '').includes(s.replace(/\D/g, '')),
    );
  }, [docs, search]);

  async function callProxy(payload: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('dfe-fiscalflow-proxy', {
      body: { companyId: company!.id, ...payload },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function handleSync() {
    if (!company?.id) return;
    setSyncing(true);
    try {
      const r = await callProxy({ action: 'sync' });
      toast.success(`Sincronizado: ${r?.total_processados || 0} novo(s) documento(s)`);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao sincronizar');
    } finally { setSyncing(false); }
  }

  async function handleManifestar() {
    if (!manifestDialog) return;
    const t = TIPO_MANIFESTACAO.find(x => x.key === manifestDialog.tipo)!;
    if (t.needsJust && justificativa.trim().length < 15) {
      toast.error('Justificativa deve ter no mínimo 15 caracteres');
      return;
    }
    setActing(true);
    try {
      await callProxy({
        action: 'manifestar',
        documentoId: manifestDialog.doc.id,
        tipo: manifestDialog.tipo,
        justificativa: justificativa.trim(),
      });
      toast.success('Manifestação enviada com sucesso');
      setManifestDialog(null); setJustificativa('');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao manifestar');
    } finally { setActing(false); }
  }

  async function handleDownloadXml(doc: Doc) {
    try {
      const r = await callProxy({ action: 'download_xml', documentoId: doc.id });
      if (r?.xml) {
        const blob = new Blob([r.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${doc.chave_acesso}.xml`;
        document.body.appendChild(a); a.click();
        a.remove(); URL.revokeObjectURL(url);
      }
      toast.success('XML baixado');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'XML indisponível. Manifeste com Ciência ou Confirmação primeiro.');
    }
  }

  async function handleIgnore(doc: Doc) {
    await supabase.from('dfe_documentos').update({ ignored: true }).eq('id', doc.id);
    toast.success('Documento ocultado');
    await load();
  }

  function copyChave(doc: Doc) {
    navigator.clipboard.writeText(doc.chave_acesso);
    toast.success('Chave copiada');
  }

  function handleImport(doc: Doc) {
    navigate(`/compras/importar-xml?documentoId=${doc.id}`);
  }

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Manifestação Eletrônica</h1>
            <p className="text-muted-foreground text-sm">
              NF-e recebidas contra o CNPJ da loja (DF-e). Manifeste para liberar o XML completo e dar entrada no estoque.
            </p>
          </div>
        </div>

        <Card className="mb-4">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por chave, emitente ou CNPJ" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="ciente">Ciência</SelectItem>
                <SelectItem value="confirmada">Confirmada</SelectItem>
                <SelectItem value="desconhecida">Desconhecida</SelectItem>
                <SelectItem value="nao_realizada">Não realizada</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button asChild variant="outline">
              <Link to="/compras/entradas">NF-e de Entrada <ChevronRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma NF-e recebida ainda.</p>
            <p className="text-xs mt-1">Clique em <b>Sincronizar SEFAZ</b> no canto inferior direito.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const st = STATUS_LABEL[d.status_manifestacao] || STATUS_LABEL.pendente;
              return (
                <Card key={d.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                        {d.tp_nf === 1 && <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">Entrada</Badge>}
                        {d.tp_nf === 2 && <Badge variant="outline">Saída</Badge>}
                        {d.situacao_nfe === '2' && <Badge variant="destructive">Cancelada</Badge>}
                        {d.tipo === 'completo' && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">XML disponível</Badge>}
                        <span className="text-xs text-muted-foreground">NSU {d.nsu ?? '—'}</span>
                      </div>
                      <div className="font-semibold truncate">{d.nome_emitente || 'Emitente desconhecido'}</div>
                      <div className="text-xs text-muted-foreground">
                        CNPJ {formatCnpj(d.cnpj_emitente)} · NF-e {d.numero_nfe || '—'} série {d.serie || '—'}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{d.chave_acesso}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-emerald-600">{formatBRL(d.valor_total)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(d.data_emissao)}</div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {TIPO_MANIFESTACAO.map(t => (
                          <DropdownMenuItem key={t.key} onClick={() => { setJustificativa(''); setManifestDialog({ doc: d, tipo: t.key }); }}>
                            <CheckCircle2 className="w-4 h-4 mr-2" /> {t.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDownloadXml(d)}><Download className="w-4 h-4 mr-2" /> Download XML</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleImport(d)} disabled={d.tipo !== 'completo' && !d.xml_path}>
                          <FileInput className="w-4 h-4 mr-2" /> Importar pro estoque
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyChave(d)}><Copy className="w-4 h-4 mr-2" /> Copiar chave</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleIgnore(d)} className="text-destructive">
                          <AlertCircle className="w-4 h-4 mr-2" /> Ignorar / ocultar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* FAB sincronizar */}
        <Button
          size="lg"
          className="fixed bottom-6 right-6 shadow-2xl rounded-full h-14 px-6 gap-2"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando…' : 'Sincronizar SEFAZ'}
        </Button>
      </div>

      {/* Diálogo manifestação */}
      <Dialog open={!!manifestDialog} onOpenChange={(o) => !o && setManifestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manifestar como {TIPO_MANIFESTACAO.find(t => t.key === manifestDialog?.tipo)?.label}</DialogTitle>
            <DialogDescription>
              Esta ação é registrada na SEFAZ e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {TIPO_MANIFESTACAO.find(t => t.key === manifestDialog?.tipo)?.needsJust && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Justificativa (mín. 15 caracteres)</label>
              <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManifestDialog(null)}>Cancelar</Button>
            <Button onClick={handleManifestar} disabled={acting}>
              {acting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function formatCnpj(c?: string | null) {
  if (!c) return '—';
  const v = c.replace(/\D/g, '').padStart(14, '0');
  return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12)}`;
}
function formatBRL(v?: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}