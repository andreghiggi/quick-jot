import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

export type CashMovementType = 'sangria' | 'suprimento';

interface Props {
  open: boolean;
  type: CashMovementType;
  companyId?: string;
  cashRegisterId?: string;
  userId?: string;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}

/**
 * Sangria = retirada de dinheiro do caixa (ex: pagamento de fornecedor).
 * Suprimento = reforço/entrada de dinheiro no caixa (ex: troco da manhã).
 *
 * Persistido em `public.cash_movements`. Não afeta TEF, PDV V2, Pedido Express
 * ou Cobrança — é um lançamento de caixa isolado.
 */
export function FrenteCaixaCashMovementDialog({
  open,
  type,
  companyId,
  cashRegisterId,
  userId,
  onOpenChange,
  onDone,
}: Props) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
    }
  }, [open]);

  const isSangria = type === 'sangria';
  const title = isSangria ? 'Sangria de caixa' : 'Suprimento de caixa';
  const description = isSangria
    ? 'Registre uma retirada de dinheiro do caixa (ex.: pagamento a fornecedor).'
    : 'Registre uma entrada de dinheiro no caixa (ex.: troco/reforço).';
  const Icon = isSangria ? ArrowUpFromLine : ArrowDownToLine;

  async function handleConfirm() {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Informe um valor maior que zero');
      return;
    }
    if (!companyId || !cashRegisterId || !userId) {
      toast.error('Caixa não está aberto');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('cash_movements' as any).insert({
      company_id: companyId,
      cash_register_id: cashRegisterId,
      type,
      amount: parsed,
      reason: reason.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error('Falha ao salvar: ' + error.message);
      return;
    }
    toast.success(`${isSangria ? 'Sangria' : 'Suprimento'} registrada com sucesso`);
    onOpenChange(false);
    onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cm-amount">Valor (R$)</Label>
            <Input
              id="cm-amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              autoFocus
              className="h-12 text-xl tabular-nums"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cm-reason">Motivo (opcional)</Label>
            <Textarea
              id="cm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isSangria
                  ? 'Ex.: pagamento fornecedor X'
                  : 'Ex.: reforço de troco'
              }
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}