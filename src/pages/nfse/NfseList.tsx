import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, RefreshCw, FileText, Download, XCircle, Search } from 'lucide-react';
import { toast } from 'sonner';

type Nfse = {
  id: string;
  numero_nfse: string | null;
  numero_dps: string | null;
  serie: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  status: string;
  ambiente: string | null;
  valor_servicos: number;
  tomador: any;
  motivo_retorno: string | null;
  created_at: string;
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  autorizada: 'default',
  processada: 'secondary',
  pendente: 'secondary',
  rejeitada: 'destructive',
  cancelada: 'outline',
};

function downloadBase64(b64: string, filename: string, mime: string) {
  const link = document.createElement('a');
  link.href = `data:${mime};base64,${b64}`;
  link.download = filename;
  link.click();
}

export default function NfseList() {
  const { company } = useAuthContext();
  const [items, setItems] = useState<Nfse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Nfse | null>(null);
  const [justificativa, setJustificativa] = useState('');

  async function load() {
    if (!company?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('nfse_records')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [company?.id]);

  async function invoke(action: string, recordId: string, payload?: any) {
    if (!company?.id) return null;
    const { data, error } = await supabase.functions.invoke('nfse-proxy', {
      body: { action, companyId: company.id, recordId, payload },
    });
    if (error) { toast.error(error.message); return null; }
    return data;
  }

  async function consultar(item: Nfse) {
    setBusyId(item.id);
    try {
      const data = await invoke('consultar', item.id);
      if (data?.success === false) { toast.error(data?.error || 'Falha na consulta'); return; }
      toast.success('Status atualizado.');
      load();
    } finally { setBusyId(null); }
  }

  async function baixarPdf(item: Nfse) {
    setBusyId(item.id);
    try {
      const data = await invoke('pdf', item.id);
      if (!data?.pdf_base64) { toast.error(data?.error || 'Falha ao gerar DANFSe'); return; }
      downloadBase64(data.pdf_base64, `danfse-${item.numero_nfse || item.id}.pdf`, 'application/pdf');
    } finally { setBusyId(null); }
  }

  async function baixarXml(item: Nfse) {
    setBusyId(item.id);
    try {
      const data = await invoke('xml', item.id);
      if (!data?.xml_base64) { toast.error(data?.error || 'Falha ao baixar XML'); return; }
      downloadBase64(data.xml_base64, `nfse-${item.numero_nfse || item.id}.xml`, 'application/xml');
    } finally { setBusyId(null); }
  }

  async function confirmarCancelamento() {
    if (!cancelTarget) return;
    if (justificativa.trim().length < 15) { toast.error('Justificativa precisa ter pelo menos 15 caracteres.'); return; }
    setBusyId(cancelTarget.id);
    try {
      const data = await invoke('cancelar', cancelTarget.id, { justificativa, motivo: 1 });
      if (data?.success === false) { toast.error(data?.error || 'Falha ao cancelar'); return; }
      toast.success('NFS-e cancelada.');
      setCancelTarget(null);
      setJustificativa('');
      load();
    } finally { setBusyId(null); }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6" /> NFS-e
            </h1>
            <p className="text-sm text-muted-foreground">
              Nota Fiscal de Serviço Eletrônica (padrão nacional SEFIN/ADN).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button asChild size="sm">
              <Link to="/nfse/nova"><Plus className="w-4 h-4 mr-2" /> Nova NFS-e</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                Nenhuma NFS-e emitida ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Série</th>
                      <th className="px-3 py-2">Tomador</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Ambiente</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Emitida em</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((n) => (
                      <tr key={n.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{n.numero_nfse || n.numero_dps || '—'}</td>
                        <td className="px-3 py-2">{n.serie || '—'}</td>
                        <td className="px-3 py-2">{n.tomador?.nome || n.tomador?.documento || '—'}</td>
                        <td className="px-3 py-2">R$ {Number(n.valor_servicos).toFixed(2).replace('.', ',')}</td>
                        <td className="px-3 py-2 text-xs uppercase">{n.ambiente || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant[n.status] || 'secondary'}>{n.status}</Badge>
                          {n.motivo_retorno && (
                            <div className="text-xs text-destructive mt-1 max-w-xs truncate" title={n.motivo_retorno}>
                              {n.motivo_retorno}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{new Date(n.created_at).toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" title="Consultar" disabled={busyId === n.id} onClick={() => consultar(n)}>
                              {busyId === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </Button>
                            {(n.status === 'autorizada' || n.status === 'processada') && (
                              <>
                                <Button variant="ghost" size="icon" title="Baixar DANFSe (PDF)" disabled={busyId === n.id} onClick={() => baixarPdf(n)}>
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Baixar XML" disabled={busyId === n.id} onClick={() => baixarXml(n)}>
                                  <FileText className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {n.status === 'autorizada' && (
                              <Button variant="ghost" size="icon" title="Cancelar" disabled={busyId === n.id} onClick={() => setCancelTarget(n)}>
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar NFS-e</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe a justificativa do cancelamento (mínimo 15 caracteres).
            </p>
            <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button variant="destructive" onClick={confirmarCancelamento} disabled={busyId === cancelTarget?.id}>
              {busyId === cancelTarget?.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
