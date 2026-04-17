import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Loader2, Lock, Unlock, Calendar as CalendarIcon, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  store: {
    id: string;
    name: string;
    serial?: string | null;
    license_status?: string | null;
    license_block_reason?: string | null;
    license_block_message?: string | null;
  } | null;
  onSaved: () => void;
}

export function BlockLicenseDialog({ open, onClose, store, onSaved }: Props) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [accept1, setAccept1] = useState(false);
  const [accept2, setAccept2] = useState(false);
  const [accept3, setAccept3] = useState(false);
  const [saving, setSaving] = useState(false);

  const isBlocked = store?.license_status === 'blocked';
  const allAccepted = accept1 && accept2 && accept3;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (open && store) {
      setReason(store.license_block_reason || '');
      setMessage(store.license_block_message || '');
      setMode('now');
      setScheduledDate(undefined);
      setAccept1(false);
      setAccept2(false);
      setAccept3(false);
    }
  }, [open, store?.id]);

  async function handleSave() {
    if (!store) return;
    if (!reason.trim()) {
      toast.error('Informe o motivo do bloqueio');
      return;
    }
    if (mode === 'schedule' && !scheduledDate) {
      toast.error('Selecione a data do bloqueio agendado');
      return;
    }
    if (!allAccepted) {
      toast.error('Você precisa aceitar todos os termos');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const updates: Record<string, unknown> = {
      license_block_reason: reason.trim().slice(0, 60),
      license_block_message: message.trim().slice(0, 120) || null,
    };

    if (mode === 'now') {
      updates.license_status = 'blocked';
      updates.license_blocked_at = new Date().toISOString();
      updates.license_blocked_by = user?.id ?? null;
      updates.license_block_scheduled_for = null;
      updates.license_block_scheduled_by = null;
      updates.active = false;
    } else {
      // agendado: mantém ativo, salva agendamento
      updates.license_block_scheduled_for = scheduledDate!.toISOString();
      updates.license_block_scheduled_by = user?.id ?? null;
    }

    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', store.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success(mode === 'now' ? 'Licença bloqueada' : 'Bloqueio agendado');
    onSaved();
    onClose();
  }

  async function handleUnblock() {
    if (!store) return;
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        license_status: 'active',
        license_block_reason: null,
        license_block_message: null,
        license_blocked_at: null,
        license_blocked_by: null,
        active: true,
      })
      .eq('id', store.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao desbloquear: ' + error.message);
      return;
    }
    toast.success('Licença liberada');
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Trava da revenda</DialogTitle>
          <DialogDescription className="sr-only">Bloqueio ou liberação da licença</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Serial:</span> <span className="font-mono">{store?.serial || '—'}</span></div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Status:</span>
              {isBlocked ? (
                <Badge variant="destructive">Bloqueada</Badge>
              ) : (
                <Badge className="bg-green-600 text-white hover:bg-green-700">Liberada</Badge>
              )}
            </div>
          </div>

          {!isBlocked && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Motivo do bloqueio</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 60))}
                  placeholder="Ex: Inadimplência mensalidade"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground text-right">{reason.length} / 60</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="message">Mensagem ao lojista (opcional)</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 120))}
                  placeholder="Ex: Entre em contato para regularizar a pendência"
                  rows={2}
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground text-right">{message.length} / 120</p>
              </div>

              <div className="rounded-md border bg-muted/30">
                <div className="px-3 py-2 border-b bg-muted/50">
                  <p className="text-sm font-semibold">Termo de Ciência e Responsabilidade — Bloqueio de Lojista</p>
                </div>
                <ScrollArea className="h-56 p-3">
                  <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 1 — Definição das partes e objeto</p>
                      <p>Este termo regula o uso da funcionalidade de bloqueio de acesso ao lojista na plataforma Comanda Tech, envolvendo: (i) Comanda Tech, administradora da plataforma; (ii) o Revendedor Autorizado; e (iii) o Lojista contratante dos serviços do Revendedor.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 2 — Autonomia do revendedor</p>
                      <p>O Revendedor é o único e exclusivo responsável pela decisão de bloquear o acesso do Lojista. A Comanda Tech disponibiliza a funcionalidade como ferramenta técnica neutra, não intervindo nem validando os motivos do bloqueio.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 3 — Isenção total de responsabilidade da Comanda Tech</p>
                      <p>A Comanda Tech se isenta integralmente de qualquer responsabilidade civil, comercial ou de qualquer natureza decorrente do bloqueio, incluindo: (a) perdas financeiras do Lojista; (b) impactos operacionais ou reputacionais; (c) reclamações de terceiros vinculados ao Lojista; (d) ações judiciais ou administrativas; (e) alegações de inadimplemento contratual entre Lojista e Revendedor.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 4 — Responsabilidade exclusiva do lojista</p>
                      <p>O Lojista é o único responsável pelo cumprimento de suas obrigações junto ao Revendedor. A Comanda Tech não possui qualquer responsabilidade de notificar, mediar ou interceder em conflitos entre as partes.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 5 — Obrigações do revendedor ao executar o bloqueio</p>
                      <p>Ao acionar o bloqueio, o Revendedor declara que: (a) existe fundamento contratual ou legal para o bloqueio; (b) assume integralmente os ônus de bloqueio indevido ou abusivo; (c) compromete-se a indenizar a Comanda Tech por quaisquer danos decorrentes de ação movida pelo Lojista.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 6 — Registro de auditoria</p>
                      <p>A Comanda Tech registrará automaticamente data, hora e identificação do Revendedor no momento do bloqueio, formando log imutável de auditoria.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 7 — Vedações</p>
                      <p>É vedado usar o bloqueio para fins de coação, extorsão ou concorrência desleal. O uso indevido poderá resultar no cancelamento do credenciamento do Revendedor.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Cláusula 8 — Foro e legislação</p>
                      <p>Este termo é regido pelas leis brasileiras, em especial o Código Civil (Lei 10.406/2002), o Marco Civil da Internet (Lei 12.965/2014) e a LGPD (Lei 13.709/2018).</p>
                    </div>
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-2.5">
                <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={accept1}
                    onChange={(e) => setAccept1(e.target.checked)}
                    className="mt-1"
                  />
                  <span>Li, compreendi e concordo integralmente com todos os termos. Estou ciente de que sou o único responsável pelo bloqueio e pelas consequências dele decorrentes.</span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={accept2}
                    onChange={(e) => setAccept2(e.target.checked)}
                    className="mt-1"
                  />
                  <span>Confirmo que a Comanda Tech está isenta de qualquer responsabilidade relacionada a este bloqueio.</span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={accept3}
                    onChange={(e) => setAccept3(e.target.checked)}
                    className="mt-1"
                  />
                  <span>Declaro que possuo fundamento contratual ou legal para bloquear este lojista e me responsabilizo por eventuais consequências jurídicas deste ato.</span>
                </label>
              </div>
            </>
          )}

          {isBlocked && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
              <p><span className="font-semibold">Motivo:</span> {store?.license_block_reason || '—'}</p>
              {store?.license_block_message && (
                <p><span className="font-semibold">Mensagem:</span> {store.license_block_message}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          {isBlocked ? (
            <Button onClick={handleUnblock} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              Liberar acesso
            </Button>
          ) : (
            <Button onClick={handleBlock} disabled={saving || !allAccepted || !reason.trim()} variant="destructive">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              Confirmar e bloquear lojista
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
