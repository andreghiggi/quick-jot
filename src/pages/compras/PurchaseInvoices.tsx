import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2,
  Inbox,
  ChevronLeft,
  MoreVertical,
  FileText,
  Download,
  ListChecks,
} from 'lucide-react';
import { renderDanfeFromXml } from '@/utils/danfePrint';
import { PurchaseInvoiceDetailsDialog } from '@/components/compras/PurchaseInvoiceDetailsDialog';

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
  xml_path?: string | null;
  natureza_operacao?: string | null;
};

export default function PurchaseInvoices() {
  const { company } = useAuthContext();
  const [items, setItems] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsInv, setDetailsInv] = useState<Inv | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function fetchXml(inv: Inv): Promise<string | null> {
    if (!inv.xml_path) {
      toast.error('XML não encontrado para esta nota.');
      return null;
    }
    const { data, error } = await supabase.storage
      .from('dfe-xmls')
      .download(inv.xml_path);
    if (error || !data) {
      toast.error('Falha ao baixar o XML.');
      return null;
    }
    return await data.text();
  }

  async function handleDownloadXml(inv: Inv) {
    setBusyId(inv.id);
    try {
      const text = await fetchXml(inv);
      if (!text) return;
      const blob = new Blob([text], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const name =
        inv.chave_acesso ||
        `nfe-${inv.serie || 'X'}-${inv.numero_nfe || inv.id.slice(0, 8)}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusyId(null);
    }
  }

  async function handleViewDanfe(inv: Inv) {
    setBusyId(inv.id);
    try {
      const text = await fetchXml(inv);
      if (!text) return;
      renderDanfeFromXml(text);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao renderizar a DANFE.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppLayout>
      <div className="container py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">NF-e de Entrada</h1>
            <p className="text-muted-foreground text-sm">Notas fiscais de compra já lançadas no estoque.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/compras/manifestacao"><ChevronLeft className="w-4 h-4 mr-1" /> Manifestação</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma NF-e de entrada lançada ainda.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {items.map(i => (
              <Card key={i.id}>
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Lançada</Badge>
                      <span className="text-xs text-muted-foreground">NF-e {i.numero_nfe} · série {i.serie}</span>
                    </div>
                    <div className="font-semibold truncate">{i.nome_emitente || 'Sem fornecedor'}</div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">{i.chave_acesso}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-600">
                      {(i.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.data_emissao ? new Date(i.data_emissao).toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyId === i.id}
                        aria-label="Ações"
                      >
                        {busyId === i.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MoreVertical className="w-4 h-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleViewDanfe(i)}>
                        <FileText className="w-4 h-4 mr-2" /> Ver DANFE
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadXml(i)}>
                        <Download className="w-4 h-4 mr-2" /> Baixar XML
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDetailsInv(i)}>
                        <ListChecks className="w-4 h-4 mr-2" /> Ver detalhes
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <PurchaseInvoiceDetailsDialog
        open={!!detailsInv}
        onOpenChange={(o) => !o && setDetailsInv(null)}
        invoice={detailsInv}
      />
    </AppLayout>
  );
}