import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Unlock } from 'lucide-react';
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
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const isBlocked = store?.license_status === 'blocked';

  useEffect(() => {
    if (open && store) {
      setReason(store.license_block_reason || '');
      setMessage(store.license_block_message || '');
      setAccepted(false);
    }
  }, [open, store?.id]);

  async function handleBlock() {
    if (!store) return;
    if (!reason.trim()) {
      toast.error('Informe o motivo do bloqueio');
      return;
    }
    if (!accepted) {
      toast.error('Você precisa aceitar os termos de uso');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('companies')
      .update({
        license_status: 'blocked',
        license_block_reason: reason.trim().slice(0, 60),
        license_block_message: message.trim().slice(0, 120) || null,
        license_blocked_at: new Date().toISOString(),
        license_blocked_by: user?.id ?? null,
        active: false,
      })
      .eq('id', store.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao bloquear: ' + error.message);
      return;
    }
    toast.success('Licença bloqueada');
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trava da revenda</DialogTitle>
          <DialogDescription className="sr-only">Bloqueio ou liberação da licença</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

              <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Aceito os <span className="text-primary font-medium">termos de uso</span> e confirmo o bloqueio do acesso desta loja.
                </span>
              </label>
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

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          {isBlocked ? (
            <Button onClick={handleUnblock} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              Liberar acesso
            </Button>
          ) : (
            <Button onClick={handleBlock} disabled={saving || !accepted || !reason.trim()} variant="destructive">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              Bloquear agora
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
