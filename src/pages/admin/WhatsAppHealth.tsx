import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type HealthStatus = 'ok' | 'deaf' | 'state' | 'disconnected' | 'error';

interface HealthRow {
  instance_name: string;
  company_id: string | null;
  company_name: string | null;
  status: HealthStatus;
  detail: string | null;
  evolution_state: string | null;
  last_in: string | null;
  last_out: string | null;
  checked_at: string;
}

const SEVERITY: Record<HealthStatus, number> = { deaf: 0, state: 1, error: 2, disconnected: 3, ok: 4 };

function statusBadge(status: HealthStatus) {
  switch (status) {
    case 'deaf':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="w-3 h-3" /> Possivelmente surda
        </Badge>
      );
    case 'state':
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 gap-1">
          <AlertTriangle className="w-3 h-3" /> Conexão divergente
        </Badge>
      );
    case 'error':
      return <Badge variant="secondary">Erro na verificação</Badge>;
    case 'disconnected':
      return (
        <Badge variant="secondary" className="gap-1">
          <WifiOff className="w-3 h-3" /> Desconectada
        </Badge>
      );
    default:
      return (
        <Badge className="bg-green-500 hover:bg-green-600 gap-1">
          <CheckCircle2 className="w-3 h-3" /> Recebendo
        </Badge>
      );
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${format(d, 'dd/MM HH:mm', { locale: ptBR })} (${formatDistanceToNow(d, { locale: ptBR, addSuffix: true })})`;
}

export default function WhatsAppHealth() {
  const navigate = useNavigate();
  const { impersonateCompany } = useAuthContext();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<HealthRow | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [qr, setQr] = useState<{ row: HealthRow; code: string; connected: boolean } | null>(null);
  const [reconnected, setReconnected] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).from('whatsapp_health').select('*');
      if (error) throw error;
      const list = ((data || []) as HealthRow[]).sort(
        (a, b) =>
          SEVERITY[a.status] - SEVERITY[b.status] ||
          (a.company_name || '').localeCompare(b.company_name || ''),
      );
      setRows(list);
    } catch (e) {
      console.error('Error fetching whatsapp health:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    const interval = setInterval(fetchRows, 30000);
    return () => clearInterval(interval);
  }, [fetchRows]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  const startPolling = (row: HealthRow) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('whatsapp-evolution', {
          body: { action: 'get_status', instanceName: row.instance_name, companyId: row.company_id },
        });
        if (data?.instance?.state === 'open') {
          stopPolling();
          setQr((q) => (q ? { ...q, connected: true } : q));
          setReconnected((r) => ({ ...r, [row.instance_name]: row.checked_at }));
          toast.success(`WhatsApp de ${row.company_name || row.instance_name} conectado!`);
        }
      } catch (e) {
        console.error('Error polling status:', e);
      }
    }, 4000);
  };

  const confirmReset = async () => {
    const row = resetTarget;
    setResetTarget(null);
    if (!row?.company_id) return;
    setResetting(row.instance_name);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'reset_instance', instanceName: row.instance_name, companyId: row.company_id },
      });
      if (data && data.success === false) throw new Error(data.error || 'Falha ao resetar a conexão');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const code: string | null = data?.qrCode || data?.base64 || data?.qrcode?.base64 || null;
      if (!code) throw new Error('O QR Code não foi gerado. Tente novamente em alguns segundos.');
      setQr({ row, code, connected: false });
      startPolling(row);
    } catch (e: any) {
      console.error('Error resetting instance:', e);
      toast.error(e.message || 'Erro ao resetar a conexão');
    } finally {
      setResetting(null);
    }
  };

  const closeQr = () => {
    stopPolling();
    setQr(null);
    fetchRows();
  };

  const openStore = async (row: HealthRow) => {
    if (!row.company_id) return;
    const ok = await impersonateCompany(row.company_id);
    if (ok) navigate('/configuracoes/whatsapp');
  };

  const attention = rows.filter((r) => ['deaf', 'state', 'error'].includes(r.status)).length;
  const healthy = rows.filter((r) => r.status === 'ok').length;
  const disconnected = rows.filter((r) => r.status === 'disconnected').length;
  const lastCheck = rows.reduce<string | null>(
    (acc, r) => (!acc || r.checked_at > acc ? r.checked_at : acc),
    null,
  );

  return (
    <AppLayout title="Saúde do WhatsApp">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Conexões de WhatsApp das lojas
            </h2>
            <p className="text-sm text-muted-foreground">
              Uma loja "possivelmente surda" aparece como conectada, mas não recebe mensagens de clientes
              (a resposta automática não sai). A verificação roda a cada 30 minutos
              {lastCheck ? `; última: ${format(new Date(lastCheck), 'dd/MM HH:mm', { locale: ptBR })}` : ''}.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRows} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Precisam de atenção</p>
              <p className={`text-3xl font-bold ${attention > 0 ? 'text-destructive' : ''}`}>{attention}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Recebendo normalmente</p>
              <p className="text-3xl font-bold text-green-600">{healthy}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Desconectadas</p>
              <p className="text-3xl font-bold">{disconnected}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma verificação registrada ainda. O monitor grava aqui a cada 30 minutos.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Última recebida</TableHead>
                    <TableHead>Última enviada</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const justReconnected = reconnected[row.instance_name] === row.checked_at;
                    return (
                      <TableRow key={row.instance_name}>
                        <TableCell>
                          <div className="font-medium">{row.company_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{row.instance_name}</div>
                        </TableCell>
                        <TableCell>
                          {justReconnected ? (
                            <Badge className="bg-green-500 hover:bg-green-600 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Reconectada agora
                            </Badge>
                          ) : (
                            statusBadge(row.status)
                          )}
                          {row.detail && !justReconnected && (
                            <div className="text-xs text-muted-foreground mt-1 max-w-xs">{row.detail}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(row.last_in)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(row.last_out)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={!row.company_id}
                              onClick={() => openStore(row)}
                            >
                              <ExternalLink className="w-4 h-4" /> Abrir loja
                            </Button>
                            <Button
                              variant={row.status === 'deaf' || row.status === 'state' ? 'default' : 'outline'}
                              size="sm"
                              className="gap-1"
                              disabled={!row.company_id || resetting === row.instance_name}
                              onClick={() => setResetTarget(row)}
                            >
                              {resetting === row.instance_name ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <QrCode className="w-4 h-4" />
                              )}
                              Resetar e gerar QR
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar o WhatsApp de {resetTarget?.company_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão atual será apagada e um QR Code novo será gerado. A loja fica sem mensagens
              automáticas e sem notificações de pedido até alguém ler o QR com o celular do WhatsApp da
              loja (WhatsApp Business &gt; Aparelhos conectados &gt; Conectar um aparelho).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>Resetar e gerar QR</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!qr} onOpenChange={(open) => !open && closeQr()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{qr?.row.company_name}</DialogTitle>
            <DialogDescription>
              {qr?.connected
                ? 'WhatsApp conectado com sucesso.'
                : 'Peça para a loja ler este QR Code com o celular do WhatsApp da loja.'}
            </DialogDescription>
          </DialogHeader>
          {qr && (
            <div className="flex flex-col items-center gap-3">
              {qr.connected ? (
                <CheckCircle2 className="w-20 h-20 text-green-500" />
              ) : (
                <>
                  <div className="p-4 bg-white rounded-xl border shadow-sm">
                    <img
                      src={qr.code.startsWith('data:') ? qr.code : `data:image/png;base64,${qr.code}`}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Aguardando a leitura do QR...
                  </p>
                </>
              )}
              <Button variant="outline" onClick={closeQr}>
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
