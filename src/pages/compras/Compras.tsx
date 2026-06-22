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
  Loader2, Search, RefreshCw, ArrowUpDown,
  ChevronLeft, ChevronRight, Package, Plus,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FrenteCaixaXmlMesDialog } from '@/components/frente-caixa/FrenteCaixaXmlMesDialog';

type Inv = {
  id: string;
  chave_acesso: string | null;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  numero_nfe: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  status: string;
  created_at: string;
};

/**
 * Hub de Compras (estilo GWeb): coluna principal lista NF-e de entrada
 * (purchase_invoices) + sidebar direita com Acesso/Ações.
 * Reaproveita `FrenteCaixaXmlMesDialog` com `source="compras"`.
 */
export default function Compras() {
  const { company } = useAuthContext();
  const navigate = useNavigate();
  const [items, setItems] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortAsc, setSortAsc] = useState(false);
  const [xmlMesOpen, setXmlMesOpen] = useState(false);

  useEffect(() => { if (company?.id) load(); }, [company?.id]);

  async function load() {
    if (!company?.id) return;
    setLoading(true);
    const { data } = await supabase.from('purchase_invoices')
      .select('*').eq('company_id', company.id)
      .order('created_at', { ascending: false }).limit(500);
    setItems((data as any) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const arr = !s ? items : items.filter(d =>
      (d.chave_acesso || '').toLowerCase().includes(s) ||
      (d.nome_emitente || '').toLowerCase().includes(s) ||
      (d.cnpj_emitente || '').includes(s.replace(/\D/g, '')) ||
      (d.numero_nfe || '').includes(s),
    );
    return [...arr].sort((a, b) => {
      const ax = a.data_emissao ? new Date(a.data_emissao).getTime() : new Date(a.created_at).getTime();
      const bx = b.data_emissao ? new Date(b.data_emissao).getTime() : new Date(b.created_at).getTime();
      return sortAsc ? ax - bx : bx - ax;
    });
  }, [items, search, sortAsc]);

  useEffect(() => { setPage(1); }, [search, perPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageStart = (page - 1) * perPage;
  const pageItems = filtered.slice(pageStart, pageStart + perPage);

  return (
    <AppLayout>
      <div className="container py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
          {/* COLUNA PRINCIPAL */}
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-4">Compras</h1>

            {/* Barra de busca + ações inline (estilo GWeb) */}
            <div className="flex items-center gap-1 border-b border-border pb-2 mb-3">
              <Search className="w-4 h-4 text-muted-foreground shrink-0 mx-2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por chave, fornecedor, CNPJ ou número..."
                className="border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent flex-1"
              />
              <Button size="icon" variant="ghost" onClick={() => setSortAsc(s => !s)} title="Ordenar por data">
                <ArrowUpDown className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={load} disabled={loading} title="Atualizar lista">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : pageItems.length === 0 ? (
              <Card>
                <CardContent className="py-20 text-center text-muted-foreground flex flex-col items-center gap-4">
                  <div className="text-6xl opacity-30 select-none">📦</div>
                  <p className="text-base">Não há nada a exibir por aqui…</p>
                  <Button
                    onClick={() => navigate('/compras/nova')}
                    className="mt-2 uppercase tracking-wide font-semibold"
                  >
                    Nova compra
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pageItems.map(i => (
                  <Card key={i.id}>
                    <CardContent className="p-4 flex flex-wrap items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Lançada</Badge>
                          <span className="text-xs text-muted-foreground">NF-e {i.numero_nfe || '—'} · série {i.serie || '—'}</span>
                        </div>
                        <div className="font-semibold truncate">{i.nome_emitente || 'Sem fornecedor'}</div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">{i.chave_acesso || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-600">
                          {(i.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {i.data_emissao ? new Date(i.data_emissao).toLocaleDateString('pt-BR') : '—'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Paginação rodapé (estilo GWeb) */}
            {pageItems.length > 0 && (
              <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground mt-4">
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
            )}
          </div>

          {/* SIDEBAR DIREITA (estilo GWeb) */}
          <aside className="space-y-4">
            <SidePanel title="Acesso">
              <SideLink to="/compras" active>Lista</SideLink>
              <SideLink to="/compras/manifestacao">Manifestação eletrônica</SideLink>
              <SideLink to="/compras/relatorios">Relatórios</SideLink>
            </SidePanel>

            <SidePanel title="Ações">
              <SideLink to="/compras/importar-xml">Importar XML</SideLink>
              <button
                onClick={() => setXmlMesOpen(true)}
                className="block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors underline-offset-2 hover:underline"
              >
                XML do mês
              </button>
            </SidePanel>

            <SidePanel title="Configurações">
              <SideLink to="/compras/configuracoes">Configurações</SideLink>
            </SidePanel>
          </aside>
        </div>
      </div>

      {/* FAB "Cadastrar nota de compra" (estilo GWeb) */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate('/compras/nova')}
              aria-label="Cadastrar nota de compra"
              className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
            >
              <Plus className="w-7 h-7" strokeWidth={2.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Cadastrar nota de compra</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {company?.id && (
        <FrenteCaixaXmlMesDialog
          open={xmlMesOpen}
          onOpenChange={setXmlMesOpen}
          companyId={company.id}
          companyName={company.name}
          source="compras"
        />
      )}
    </AppLayout>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="p-1">{children}</div>
    </div>
  );
}

function SideLink({ to, active, children }: { to: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`block px-3 py-2 text-sm rounded-md transition-colors underline-offset-2 hover:underline ${
        active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
      }`}
    >
      {children}
    </Link>
  );
}