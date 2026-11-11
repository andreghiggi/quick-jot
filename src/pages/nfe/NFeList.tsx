import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, RefreshCw, FileText, MoreHorizontal, Pencil, Trash2, Eye, Mail, Copy, MessageSquare, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { canEditNfe, canDeleteNfe, nfeEventTextValid } from '../../../supabase/functions/_shared/nfe-record-actions';
import { toast } from 'sonner';
import { nfeDanfeFromXml, openNfeDanfe } from '@/lib/nfeDanfe';
import { readNfeInvokeError, nfeFailureMessage } from '@/lib/nfeErrors';

type NFe = {
  id: string;
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
  created_at: string;
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  autorizada: 'default',
  pendente: 'secondary',
  rejeitada: 'destructive',
  cancelada: 'outline',
};

export default function NFeList() {
  const { company } = useAuthContext();
  const [items, setItems] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ note: NFe; action: 'excluir' | 'cancelar' | 'email' | 'correcao' } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  function showAction(note: NFe, action: 'excluir' | 'cancelar' | 'email' | 'correcao') {
    setText(action === 'email' ? note.destinatario?.email || '' : '');
    setActionError(''); setDialog({ note, action });
  }

  async function confirmAction() {
    if (!dialog || !company?.id || busy) return;
    if (!['excluir', 'cancelar'].includes(dialog.action)) return;
    if (dialog.action === 'cancelar' && !nfeEventTextValid(text)) return;
    setBusy(true);
    try {
      if (dialog.action === 'excluir') {
        const note = dialog.note;
        if (!['rascunho', 'rejeitada'].includes(note.status) || note.chave_acesso || note.protocolo) throw new Error('Somente registros não autorizados podem ser excluídos.');
        const guard = (q: any) => q.eq('id', note.id).eq('company_id', company.id).in('status', ['rascunho', 'rejeitada']).is('chave_acesso', null).is('protocolo', null);
        const { data: del, error: delErr } = await guard((supabase as any).from('nfe_records').delete()).select('id');
        if (delErr || !del?.length) {
          const { data: upd, error: updErr } = await guard((supabase as any).from('nfe_records').update({ status: 'excluida' })).select('id');
          if (updErr) throw updErr;
          if (!upd?.length) throw new Error('Não foi possível excluir este registro.');
        }
        toast.success('Registro excluído.'); setDialog(null); await load(); return;
      }
      const { data, error } = await supabase.functions.invoke('nfe-proxy', {
        body: { action: dialog.action, companyId: company.id, recordId: dialog.note.id,
          nfeId: dialog.note.nfe_id || undefined, payload: { justificativa: text.trim() } },
      });
      if (error) throw error;
      if (data?.success === false || data?.error || data?.ok === false) throw new Error(nfeFailureMessage(data));
      toast.success('Cancelamento solicitado ao serviço fiscal.');
      setDialog(null); await load();
    } catch (error) { setActionError(await readNfeInvokeError(error)); }
    finally { setBusy(false); }
  }

  async function viewDanfe(note: NFe) {
    if (!company?.id || !note.nfe_id) return;
    setOpening(note.id);
    try {
      const { data, error } = await supabase.functions.invoke('nfe-proxy', {
        body: { action: 'xml', companyId: company.id, nfeId: note.nfe_id, recordId: note.id },
      });
      if (error) throw error;
      const result = data?.data || data;
      const xml = typeof result === 'string' ? result : result?.xml_content || result?.xml || result?.xml_retorno;
      if (typeof xml !== 'string' || !xml.trim().startsWith('<')) throw new Error(nfeFailureMessage(data) || 'XML autorizado não disponível para esta NF-e.');
      openNfeDanfe(nfeDanfeFromXml(xml));
    } catch (error) { toast.error(await readNfeInvokeError(error)); }
    finally { setOpening(null); }
  }

  async function load() {
    if (!company?.id) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('nfe_records')
      .select('*')
      .eq('company_id', company.id)
      .not('status', 'in', '(rascunho_transmitido,excluida)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) toast.error('Não foi possível carregar as NF-e.');
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [company?.id]);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6" /> NF-e (modelo 55)
            </h1>
            <p className="text-sm text-muted-foreground">
              Emissão de Nota Fiscal Eletrônica para destinatários PJ.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button asChild size="sm">
              <Link to="/nfe/nova"><Plus className="w-4 h-4 mr-2" /> Nova NF-e</Link>
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
                Nenhuma NF-e emitida ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Série</th>
                      <th className="px-3 py-2">Destinatário</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Ambiente</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Emitida em</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((n) => (
                      <tr key={n.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{n.numero || '—'}</td>
                        <td className="px-3 py-2">{n.serie || '—'}</td>
                        <td className="px-3 py-2">
                          {n.destinatario?.razao_social || n.destinatario?.nome || n.destinatario?.cnpj || '—'}
                        </td>
                        <td className="px-3 py-2">R$ {Number(n.valor_total).toFixed(2).replace('.', ',')}</td>
                        <td className="px-3 py-2 text-xs uppercase">{n.ambiente || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant[n.status] || 'secondary'}>{n.status}</Badge>
                          {n.status === 'rascunho' && (
                            <Link to={`/nfe/nova?rascunho=${n.id}`} className="ml-2 text-xs text-primary underline">Continuar</Link>
                          )}
                          {n.motivo_rejeicao && (
                            <div className="text-xs text-destructive mt-1 max-w-xs truncate" title={n.motivo_rejeicao}>
                              {n.motivo_rejeicao}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{new Date(n.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {canEditNfe(n) && <Button asChild variant="ghost" size="icon" title="Editar e retransmitir" aria-label="Editar e retransmitir"><Link to={`/nfe/nova?editar=${n.id}`}><Pencil className="w-4 h-4" /></Link></Button>}
                            {canDeleteNfe(n) && <Button variant="ghost" size="icon" title="Excluir" aria-label="Excluir" onClick={() => showAction(n, 'excluir')}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                            {n.status === 'autorizada' && <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Opções da NF-e" title="Opções da NF-e" disabled={opening === n.id}>{opening === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}</Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem disabled={!n.nfe_id} onSelect={() => viewDanfe(n)}><Eye className="w-4 h-4 mr-2" />Visualizar</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => showAction(n, 'email')}><Mail className="w-4 h-4 mr-2" />Enviar por e-mail</DropdownMenuItem>
                                <DropdownMenuItem asChild><Link to={`/nfe/nova?duplicar=${n.id}`}><Copy className="w-4 h-4 mr-2" />Duplicar</Link></DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => showAction(n, 'correcao')}><MessageSquare className="w-4 h-4 mr-2" />Carta de correção</DropdownMenuItem>
                                <DropdownMenuItem disabled={!n.nfe_id} onSelect={() => showAction(n, 'cancelar')} className="text-destructive"><XCircle className="w-4 h-4 mr-2" />Cancelar</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>}
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
      <Dialog open={!!dialog} onOpenChange={open => { if (!open && !busy) setDialog(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.action === 'excluir' ? 'Excluir NF-e' : dialog?.action === 'cancelar' ? 'Cancelar NF-e' : dialog?.action === 'email' ? 'Enviar por e-mail' : 'Carta de correção'}</DialogTitle>
            <DialogDescription>{dialog?.action === 'excluir' ? 'Excluir somente este registro não autorizado? Esta ação não cancela nem inutiliza numeração fiscal.' : dialog?.action === 'cancelar' ? 'O cancelamento será enviado à SEFAZ. Informe a justificativa (15 a 1000 caracteres).' : 'Este envio depende da integração disponibilizada pelo serviço fiscal e ainda não está disponível.'}</DialogDescription>
          </DialogHeader>
          {dialog?.action === 'cancelar' && <Textarea aria-label="Justificativa do cancelamento" value={text} onChange={e => setText(e.target.value)} maxLength={1000} disabled={busy} />}
          {dialog?.action === 'email' && <Input aria-label="E-mail do destinatário" type="email" value={text} onChange={e => setText(e.target.value)} />}
          {dialog?.action === 'correcao' && <Textarea aria-label="Texto da carta de correção" value={text} onChange={e => setText(e.target.value)} maxLength={1000} />}
          {actionError && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>Voltar</Button>
            {(dialog?.action === 'excluir' || dialog?.action === 'cancelar') && <Button variant="destructive" onClick={confirmAction} disabled={busy || (dialog?.action === 'cancelar' && !nfeEventTextValid(text))}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{dialog?.action === 'excluir' ? 'Confirmar exclusão' : 'Confirmar cancelamento'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}