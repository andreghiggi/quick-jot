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
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  RefreshCw, Copy, Download, FileInput, Loader2,
  CheckCircle2, AlertCircle, Inbox, Search, CloudDownload,
  ArrowUpDown, SlidersHorizontal, ChevronLeft, ChevronRight,
  MoreVertical, FileSearch, Ban, FileText, Square, CheckSquare,
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
  imported_at: string | null;
  imported_invoice_id: string | null;
  ignored: boolean;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  ciente: { label: 'Ciência', cls: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  confirmada: { label: 'Confirmada', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  desconhecida: { label: 'Desconhecida', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
  nao_realizada: { label: 'Não realizada', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
};

const TIPO_MANIFESTACAO: { key: string; label: string; needsJust?: boolean }[] = [
  { key: 'ciencia', label: 'Ciência da operação' },
  { key: 'confirmacao', label: 'Confirmação da operação' },
  { key: 'desconhecimento', label: 'Desconhecimento da operação', needsJust: true },
  { key: 'nao_realizada', label: 'Operação não realizada', needsJust: true },
];

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
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDialog, setBatchDialog] = useState<{ tipo: string } | null>(null);
  const [batchJust, setBatchJust] = useState('');
  const [batchActing, setBatchActing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);

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
    const arr = !s ? docs : docs.filter(d =>
      (d.chave_acesso || '').toLowerCase().includes(s) ||
      (d.nome_emitente || '').toLowerCase().includes(s) ||
      (d.cnpj_emitente || '').includes(s.replace(/\D/g, '')),
    );
    return [...arr].sort((a, b) => {
      const ax = a.data_emissao ? new Date(a.data_emissao).getTime() : 0;
      const bx = b.data_emissao ? new Date(b.data_emissao).getTime() : 0;
      return sortAsc ? ax - bx : bx - ax;
    });
  }, [docs, search, sortAsc]);

  useEffect(() => { setPage(1); }, [search, statusFilter, perPage]);
  useEffect(() => { setSelected(new Set()); }, [search, statusFilter, page, perPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageStart = (page - 1) * perPage;
  const pageItems = filtered.slice(pageStart, pageStart + perPage);
  const pageIds = pageItems.map(d => d.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const somePageSelected = pageIds.some(id => selected.has(id));

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

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  }

  async function handleBatchManifestar() {
    if (!batchDialog) return;
    const t = TIPO_MANIFESTACAO.find(x => x.key === batchDialog.tipo)!;
    if (t.needsJust && batchJust.trim().length < 15) {
      toast.error('Justificativa deve ter no mínimo 15 caracteres');
      return;
    }
    setBatchActing(true);
    try {
      const ids = Array.from(selected);
      const r = await callProxy({
        action: 'manifestar_lote',
        documentoIds: ids,
        tipo: batchDialog.tipo,
        justificativa: batchJust.trim(),
      });
      toast.success(`${r?.ok || 0} manifestada(s)${r?.fails?.length ? `, ${r.fails.length} falha(s)` : ''}`);
      setBatchDialog(null); setBatchJust(''); setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Falha em lote');
    } finally { setBatchActing(false); }
  }

  async function handleBatchIgnore() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await supabase.from('dfe_documentos').update({ ignored: true }).in('id', ids);
    toast.success(`${ids.length} documento(s) ocultado(s)`);
    setSelected(new Set());
    await load();
  }

  async function handleConsultarSefaz(doc: Doc) {
    try {
      await callProxy({ action: 'consultar', documentoId: doc.id });
      toast.success('Consulta SEFAZ concluída');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao consultar SEFAZ');
    }
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
      <div className="container py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
          {/* COLUNA PRINCIPAL */}
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-4">
              Manifestação do Destinatário eletrônica
            </h1>

            {/* Barra de busca + ações inline (estilo GWeb) */}
            <div className="flex items-center gap-1 border-b border-border pb-2 mb-3">
              <Search className="w-4 h-4 text-muted-foreground shrink-0 mx-2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Digite para buscar..."
                className="border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent flex-1"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="border-0 shadow-none w-auto gap-1 px-2 hover:bg-muted">
                  <SlidersHorizontal className="w-4 h-4" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="ciente">Ciência</SelectItem>
                  <SelectItem value="confirmada">Confirmada</SelectItem>
                  <SelectItem value="desconhecida">Desconhecida</SelectItem>
                  <SelectItem value="nao_realizada">Não realizada</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => setSortAsc(s => !s)} title="Ordenar por data">
                <ArrowUpDown className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={load} disabled={loading} title="Atualizar lista">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Paginação topo */}
            <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground mb-2">
              <div className="flex items-center gap-2">
                <span>Por página</span>
                <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
                  <SelectTrigger className="h-7 w-[64px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <span>
                {filtered.length === 0 ? '0' : `${pageStart + 1} – ${Math.min(pageStart + perPage, filtered.length)}`} / {filtered.length}
              </span>
              <div className="flex">
                <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Barra de ações em lote */}
            {selectionMode && selected.size > 0 && (
              <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30">
                <div className="text-sm font-medium">{selected.size} selecionada(s)</div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="default">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Manifestar-se em lote
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {TIPO_MANIFESTACAO.map(t => (
                        <DropdownMenuItem key={t.key} onClick={() => { setBatchJust(''); setBatchDialog({ tipo: t.key }); }}>
                          {t.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="sm" variant="outline" onClick={handleBatchIgnore}>
                    <Ban className="w-4 h-4 mr-1" /> Ignorar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set()); setSelectionMode(false); }}>
                    Limpar
                  </Button>
                </div>
              </div>
            )}

            {/* Lista */}
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : pageItems.length === 0 ? (
              <Card><CardContent className="py-16 text-center text-muted-foreground">
                <Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Nenhuma NF-e recebida ainda.</p>
                <p className="text-xs mt-1">Clique em <b>Sincronizar SEFAZ</b> no canto inferior direito.</p>
              </CardContent></Card>
            ) : (
              <div className="border-y border-border">
                {/* header com master checkbox */}
                {selectionMode && (
                  <div className="flex items-center gap-4 px-1 py-2 border-b border-border bg-muted/30">
                    <Checkbox
                      checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                      onCheckedChange={togglePage}
                      aria-label="Marcar todos"
                    />
                    <span className="text-xs text-muted-foreground">Marcar todos desta página</span>
                  </div>
                )}
                <div className="divide-y divide-border">
                {pageItems.map((d) => {
                  const st = STATUS_LABEL[d.status_manifestacao] || STATUS_LABEL.pendente;
                  const importada = d.tipo === 'completo' || !!d.xml_path;
                  const title = d.tipo === 'resumo'
                    ? `Resumo de NF-e ${d.numero_nfe || '—'}`
                    : `NF-e ${d.numero_nfe || '—'}`;
                  const isSel = selected.has(d.id);
                  return (
                    <div key={d.id} className={`flex items-center gap-4 py-4 px-1 hover:bg-muted/40 transition-colors ${isSel && selectionMode ? 'bg-primary/5' : ''}`}>
                      {selectionMode && (
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleOne(d.id)}
                          aria-label="Marcar"
                          className="shrink-0"
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-semibold">{title}</span>
                          <span className="text-muted-foreground"> de {formatDateTime(d.data_emissao)}</span>
                        </div>
                        <div className="font-medium truncate">{d.nome_emitente || 'Emitente desconhecido'}</div>
                        <div className="text-xs text-muted-foreground italic font-mono mt-0.5 truncate">
                          <span className="font-semibold not-italic">NSU:</span> {d.nsu ?? '—'} &nbsp;
                          <span className="font-semibold not-italic">Chave:</span> {d.chave_acesso} &nbsp;
                          <span className="font-semibold not-italic">Valor:</span>{' '}
                          <span className="text-emerald-600 font-semibold not-italic">{formatBRL(d.valor_total)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {importada ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 rounded-full px-3">Importada</Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-700 border border-rose-500/30 rounded-full px-3">Não importada</Badge>
                        )}
                        <Badge variant="outline" className={`${st.cls} rounded-full text-[10px]`}>{st.label}</Badge>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0"
                            aria-label="Ações"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {!selectionMode && (
                            <DropdownMenuItem onClick={() => { setSelectionMode(true); setSelected(new Set([d.id])); }}>
                              <Square className="w-4 h-4 mr-2" /> Marcar
                            </DropdownMenuItem>
                          )}
                          {selectionMode && (
                            <DropdownMenuItem onClick={() => { setSelectionMode(false); setSelected(new Set()); }}>
                              <CheckSquare className="w-4 h-4 mr-2" /> Desmarcar tudo
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copyChave(d)}>
                            <Copy className="w-4 h-4 mr-2" /> Copiar chave de acesso
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <FileText className="w-4 h-4 mr-2" /> Manifestar-se
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="w-56">
                                {TIPO_MANIFESTACAO.map(t => (
                                  <DropdownMenuItem key={t.key} onClick={() => { setJustificativa(''); setManifestDialog({ doc: d, tipo: t.key }); }}>
                                    {t.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          <DropdownMenuItem onClick={() => handleDownloadXml(d)}>
                            <Download className="w-4 h-4 mr-2" /> Download XML
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleImport(d)} disabled={!importada}>
                            <FileInput className="w-4 h-4 mr-2" /> Importar XML
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleConsultarSefaz(d)}>
                            <FileSearch className="w-4 h-4 mr-2" /> Consultar na SEFAZ
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleIgnore(d)} className="text-destructive">
                            <Ban className="w-4 h-4 mr-2" /> Ignorar NF-e
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>

          {/* SIDEBAR DIREITA (estilo GWeb) */}
          <aside className="space-y-4">
            <SidePanel title="Acesso">
              <SideLink to="/compras/manifestacao" active>Manifestação eletrônica</SideLink>
            </SidePanel>

            <SidePanel title="Ações">
              <SideLink to="/compras/importar-xml">Importar XML</SideLink>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors underline-offset-2 hover:underline disabled:opacity-50"
              >
                {syncing ? 'Sincronizando…' : 'Sincronizar SEFAZ'}
              </button>
            </SidePanel>
          </aside>
        </div>

        {/* FAB sincronizar (laranja, igual GWeb) */}
        <Button
          size="icon"
          className="fixed bottom-6 right-6 shadow-2xl rounded-full h-14 w-14 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleSync}
          disabled={syncing}
          title="Sincronizar SEFAZ"
        >
          {syncing
            ? <Loader2 className="w-6 h-6 animate-spin" />
            : <CloudDownload className="w-6 h-6" />}
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

      {/* Diálogo manifestação em lote */}
      <Dialog open={!!batchDialog} onOpenChange={(o) => !o && setBatchDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Manifestar {selected.size} nota(s) como {TIPO_MANIFESTACAO.find(t => t.key === batchDialog?.tipo)?.label}
            </DialogTitle>
            <DialogDescription>
              Esta ação é registrada na SEFAZ e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {TIPO_MANIFESTACAO.find(t => t.key === batchDialog?.tipo)?.needsJust && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Justificativa (mín. 15 caracteres, aplicada a todas)</label>
              <Textarea value={batchJust} onChange={e => setBatchJust(e.target.value)} rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialog(null)}>Cancelar</Button>
            <Button onClick={handleBatchManifestar} disabled={batchActing}>
              {batchActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
        {title}
      </div>
      <div className="py-1">{children}</div>
    </div>
  );
}

function SideLink({ to, active, children }: { to: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`block px-3 py-2 text-sm transition-colors rounded-md mx-1 ${
        active
          ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
          : 'hover:bg-muted text-foreground/80 hover:text-foreground'
      }`}
    >
      {children}
    </Link>
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
function formatDateTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const time = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}