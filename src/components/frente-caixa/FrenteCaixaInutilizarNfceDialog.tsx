import { useEffect, useMemo, useState } from 'react';
import { FileX2, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  companyId?: string;
  onOpenChange: (o: boolean) => void;
}

interface InutRow {
  id: string;
  serie: string;
  numero_inicial: number;
  numero_final: number;
  ano: number;
  status: string;
  justificativa: string;
  protocolo: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
}

const STATUS: Record<string, { label: string; icon: any; cls: string }> = {
  pendente: { label: 'Pendente', icon: Clock, cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  aceita: { label: 'Aceita', icon: CheckCircle2, cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  rejeitada: { label: 'Rejeitada', icon: XCircle, cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export function FrenteCaixaInutilizarNfceDialog({ open, companyId, onOpenChange }: Props) {
  const currentYear = new Date().getFullYear();
  const [serie, setSerie] = useState('1');
  const [numIni, setNumIni] = useState('');
  const [numFim, setNumFim] = useState('');
  const [ano, setAno] = useState(String(currentYear));
  const [justificativa, setJustificativa] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<InutRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const justOk = justificativa.trim().length >= 15;

  async function loadHistory() {
    if (!companyId) return;
    setLoadingHist(true);
    const { data } = await supabase
      .from('nfce_inutilizacoes' as any)
      .select('id, serie, numero_inicial, numero_final, ano, status, justificativa, protocolo, motivo_rejeicao, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory((data as any) || []);
    setLoadingHist(false);
  }

  useEffect(() => {
    if (open) {
      setSerie('1');
      setNumIni('');
      setNumFim('');
      setAno(String(currentYear));
      setJustificativa('');
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  async function handleSubmit() {
    const ini = parseInt(numIni, 10);
    const fim = parseInt(numFim, 10);
    if (!serie.trim() || !Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) {
      toast.error('Informe série e faixa de numeração válida');
      return;
    }
    if (!justOk) {
      toast.error('Justificativa precisa ter ao menos 15 caracteres');
      return;
    }
    if (!companyId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('nfce-proxy', {
        body: {
          action: 'inutilizar',
          companyId,
          payload: {
            serie: serie.trim(),
            numero_inicial: ini,
            numero_final: fim,
            ano: parseInt(ano, 10),
            justificativa: justificativa.trim(),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.status === 'aceita') {
        toast.success('Inutilização aceita pela SEFAZ');
      } else if (data?.status === 'rejeitada') {
        toast.error('Inutilização rejeitada: ' + (data?.error || 'verifique o histórico'));
      } else {
        toast.info('Pedido de inutilização registrado');
      }
      await loadHistory();
      setNumIni('');
      setNumFim('');
      setJustificativa('');
    } catch (e: any) {
      toast.error('Falha: ' + (e?.message || 'desconhecido'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileX2 className="h-5 w-5" />
            Inutilizar faixa de NFC-e
          </DialogTitle>
          <DialogDescription>
            Solicita à SEFAZ a inutilização de uma faixa de numeração de NFC-e não usada
            (por falha técnica, salto de numeração, etc.). A operação é definitiva.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="novo">
          <TabsList>
            <TabsTrigger value="novo">Novo pedido</TabsTrigger>
            <TabsTrigger value="hist">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="novo" className="space-y-4 mt-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="inut-serie">Série</Label>
                <Input
                  id="inut-serie"
                  value={serie}
                  onChange={(e) => setSerie(e.target.value.replace(/\D/g, ''))}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inut-ano">Ano</Label>
                <Input
                  id="inut-ano"
                  type="number"
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inut-ini">Número inicial</Label>
                <Input
                  id="inut-ini"
                  type="number"
                  value={numIni}
                  onChange={(e) => setNumIni(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inut-fim">Número final</Label>
                <Input
                  id="inut-fim"
                  type="number"
                  value={numFim}
                  onChange={(e) => setNumFim(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="inut-just">
                Justificativa{' '}
                <span className={`text-xs ${justOk ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  ({justificativa.trim().length}/15 min)
                </span>
              </Label>
              <Textarea
                id="inut-just"
                rows={3}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Descreva o motivo da inutilização (mín. 15 caracteres)"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={sending || !justOk}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar à SEFAZ
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="hist" className="mt-4">
            <ScrollArea className="h-80 border rounded-md">
              {loadingHist ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum pedido de inutilização registrado.
                </div>
              ) : (
                <ul className="divide-y">
                  {history.map((h) => {
                    const cfg = STATUS[h.status] || STATUS.pendente;
                    const Icon = cfg.icon;
                    return (
                      <li key={h.id} className="p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            Série {h.serie} · {h.numero_inicial}
                            {h.numero_final !== h.numero_inicial ? `–${h.numero_final}` : ''} · {h.ano}
                          </span>
                          <Badge variant="outline" className={`${cfg.cls} text-[11px]`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{h.justificativa}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          {h.protocolo ? ` · Protocolo: ${h.protocolo}` : ''}
                        </p>
                        {h.motivo_rejeicao && (
                          <p className="text-xs text-destructive">{h.motivo_rejeicao}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}