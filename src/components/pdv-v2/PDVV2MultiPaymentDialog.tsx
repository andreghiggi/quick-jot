import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput, parseDecimalLivre } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Split, Loader2 } from 'lucide-react';
import { usePaymentMethods, PaymentChannel } from '@/hooks/usePaymentMethods';
import { brl } from './_format';
import type { MultiPaymentInputLine } from '@/utils/pdvV2MultiPayment';

/**
 * Dialog isolado de pagamento com múltiplas formas (NFC-e v1.6).
 * NÃO altera o PDVV2PaymentDialog single-payment (que continua intocado).
 * O caller recebe as linhas via `onConfirm` e é responsável por executar
 * `runMultiPayment` + registrar venda + emitir NFC-e com `pagamentos_split`.
 */

interface LineDraft {
  uid: string;
  payment_method_id: string;
  amount_text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  total: number;
  channel?: PaymentChannel;
  title?: string;
  /** Status TEF/processamento (exibido como banner). */
  processingStatus?: string;
  /** True enquanto runMultiPayment está em execução. */
  processing?: boolean;
  onConfirm: (lines: MultiPaymentInputLine[]) => Promise<void> | void;
}

function genUid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PDVV2MultiPaymentDialog({
  open,
  onOpenChange,
  companyId,
  total,
  channel = 'pdv',
  title = 'Dividir formas de pagamento',
  processingStatus,
  processing = false,
  onConfirm,
}: Props) {
  const { activePaymentMethods: rawList } = usePaymentMethods({ companyId, channel });
  const { activePaymentMethods: allList } = usePaymentMethods({ companyId });
  const methods = rawList.length > 0 ? rawList : allList;

  const [lines, setLines] = useState<LineDraft[]>([]);

  // Inicializa com 2 linhas vazias quando abre (primeira pré-selecionada com
  // o primeiro método). Limpa ao fechar.
  useEffect(() => {
    if (open) {
      const first = methods[0]?.id || '';
      setLines([
        { uid: genUid(), payment_method_id: first, amount_text: '' },
        { uid: genUid(), payment_method_id: first, amount_text: '' },
      ]);
    } else {
      setLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sum = useMemo(
    () => lines.reduce((s, l) => {
      const n = parseDecimalLivre(l.amount_text);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0),
    [lines],
  );
  const remaining = Math.max(0, total - sum);
  const over = sum > total + 0.005;
  const exact = Math.abs(sum - total) < 0.005;

  function addLine() {
    if (lines.length >= 6) return;
    const first = methods[0]?.id || '';
    // pré-preenche o valor restante para acelerar o lojista
    const preFill = remaining > 0 ? remaining.toFixed(2).replace('.', ',') : '';
    setLines((prev) => [...prev, { uid: genUid(), payment_method_id: first, amount_text: preFill }]);
  }

  function removeLine(uid: string) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.uid !== uid)));
  }

  function updateLine(uid: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  async function handleConfirm() {
    if (!exact) return;
    const out: MultiPaymentInputLine[] = lines
      .map((l) => {
        const method = methods.find((m) => m.id === l.payment_method_id);
        if (!method) return null;
        const parsed = parseDecimalLivre(l.amount_text);
        const amount = Number.isFinite(parsed) ? parsed : 0;
        if (amount <= 0) return null;
        const integration = (method as any).integration_type as string | undefined;
        const isTef = integration === 'tef_pinpad' || integration === 'tef_smartpos';
        return {
          payment_method_id: method.id,
          payment_name: method.name,
          amount,
          integration: isTef ? (integration as 'tef_pinpad' | 'tef_smartpos') : undefined,
          tef_options: isTef ? { modality: 'avista' as const } : undefined,
        } as MultiPaymentInputLine;
      })
      .filter((l): l is MultiPaymentInputLine => l !== null);
    if (out.length < 2) return;
    await onConfirm(out);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !processing && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-4 w-4" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {processingStatus && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex items-center gap-2">
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{processingStatus}</span>
            </div>
          )}

          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Total da venda</span>
            <span className="font-semibold">{brl(total)}</span>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={line.uid} className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">Forma {idx + 1}</Label>
                  <Select
                    value={line.payment_method_id}
                    onValueChange={(v) => updateLine(line.uid, { payment_method_id: v })}
                    disabled={processing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => {
                        const itg = (m as any).integration_type as string | undefined;
                        const isTef = itg === 'tef_pinpad' || itg === 'tef_smartpos';
                        return (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                            {isTef ? ' (TEF)' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36">
                  <Label className="text-xs text-muted-foreground">Valor</Label>
                  <CurrencyInput
                    placeholder="0,00"
                    value={line.amount_text}
                    onValueChange={(_, text) =>
                      updateLine(line.uid, { amount_text: text })
                    }
                    disabled={processing}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLine(line.uid)}
                  disabled={processing || lines.length <= 2}
                  aria-label="Remover linha"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLine}
            disabled={processing || lines.length >= 6}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar forma
          </Button>

          <div className="rounded-md border px-3 py-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Somado</span>
              <span className="font-semibold">{brl(sum)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{over ? 'Excedente' : 'Restante'}</span>
              <span
                className={
                  exact
                    ? 'font-semibold text-green-600'
                    : over
                      ? 'font-semibold text-destructive'
                      : 'font-semibold'
                }
              >
                {over ? brl(sum - total) : brl(remaining)}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-snug">
            Em caso de recusa em qualquer linha TEF, todas as cobranças já aprovadas serão
            <strong> estornadas automaticamente</strong> e a venda não será registrada.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={processing || !exact}>
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…
              </>
            ) : (
              <>Cobrar {brl(sum)}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}