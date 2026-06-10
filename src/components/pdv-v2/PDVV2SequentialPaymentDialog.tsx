import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Split, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { usePaymentMethods, PaymentChannel } from '@/hooks/usePaymentMethods';
import { brl, maskCurrencyInput, parseCurrencyInput } from './_format';
import { runTefPayment, type TefOptions } from '@/utils/pdvV2Tef';
import {
  rollbackApprovedTef,
  type MultiPaymentInputLine,
  type MultiPaymentResolvedLine,
} from '@/utils/pdvV2MultiPayment';
import { supabase } from '@/integrations/supabase/client';

/**
 * Multi-pagamento sequencial v1.7 (beta).
 *
 * Drop-in para o `PDVV2MultiPaymentDialog` v1.6: mesma assinatura de props
 * essenciais. A diferença é o fluxo:
 *
 *  - Cobrança uma forma de cada vez. Para TEF, mostra seletor de modalidade
 *    (à vista / crédito / débito / parcelado / PIX) ANTES de cobrar.
 *  - Cada cobrança aprovada é persistida em `pdv_v2_open_charges`.
 *  - Modal **travado** (sem ESC, sem clicar fora, sem botão X) enquanto há
 *    valor restante > 0. Se a sessão cair e o usuário reabrir o mesmo
 *    contexto, o dialog reidrata as linhas aprovadas e segue de onde parou.
 *  - Em recusa: NÃO faz rollback automático. Operador pode tentar outra
 *    forma/valor; ou usar "Cancelar e estornar tudo" (confirm) que faz CNC
 *    em cada TEF aprovado.
 *  - Ao zerar o restante: chama `onConfirm(lines)` com cada linha já carregando
 *    `_resolved` — runMultiPayment trata como passthrough e o caller segue o
 *    mesmo fluxo existente (addSale + nfce-proxy com pagamentos_split).
 *
 * Nada de `runTefPayment`, `pinpadService`, `tef-webservice`, `nfce-proxy`,
 * `PDVV2PaymentDialog` single-payment ou splits I9 é tocado.
 */

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  total: number;
  channel?: PaymentChannel;
  title?: string;
  processingStatus?: string;
  processing?: boolean;
  /**
   * Identificador do contexto da cobrança (ex.: `order:UUID`, `tab:UUID`,
   * `express:CART_HASH`). Usado para reidratar a cobrança em aberto se o
   * sistema cair no meio. Opcional — sem ele, a persistência fica desativada
   * e o dialog se comporta como sequencial efêmero.
   */
  contextKey?: string;
  /** Caixa atual — necessário para persistir/reidratar. */
  cashRegisterId?: string;
  /** Rótulo livre do contexto (ex.: 'Mesa 7', 'Pedido #AB12CD'). */
  contextLabel?: string;
  /**
   * Quando true, o dialog exibe seletor "Só Venda / Venda com NFC-e" (igual
   * single-payment). Quando há linha TEF aprovada, a NFC-e é forçada
   * automaticamente (NFC-e obrigatória por lei) e o seletor desaparece.
   * Default: false (mantém comportamento legado se não passar).
   */
  fiscalEnabled?: boolean;
  /**
   * Mesma assinatura do v1.6: caller recebe linhas e roda runMultiPayment.
   * Aqui as linhas vêm com `_resolved` preenchido → runMultiPayment vira
   * passthrough (nenhum TEF é re-executado).
   * Segundo parâmetro `opts.wantsNfce` indica se a NFC-e deve ser emitida.
   */
  onConfirm: (
    lines: MultiPaymentInputLine[],
    opts: { wantsNfce: boolean },
  ) => Promise<void> | void;
}

type TefModality = 'avista' | 'parcelado' | 'debit' | 'pix';

const CONTEXT_TYPE_MAP: Record<string, string> = {
  order: 'order_card',
  tab: 'pdv_v2_tab',
  express: 'pedido_express',
  pdv: 'pdv_v2_order',
};

function contextTypeFromKey(key?: string): string {
  if (!key) return 'pdv_v2_order';
  const prefix = key.split(':')[0];
  return CONTEXT_TYPE_MAP[prefix] || 'pdv_v2_order';
}

export function PDVV2SequentialPaymentDialog({
  open,
  onOpenChange,
  companyId,
  total,
  channel = 'pdv',
  title = 'Dividir formas de pagamento',
  processingStatus,
  processing = false,
  contextKey,
  cashRegisterId,
  contextLabel,
  fiscalEnabled = false,
  onConfirm,
}: Props) {
  const { activePaymentMethods: rawList } = usePaymentMethods({ companyId, channel });
  const { activePaymentMethods: allList } = usePaymentMethods({ companyId });
  const methods = rawList.length > 0 ? rawList : allList;

  // Linhas aprovadas até agora (persistidas em pdv_v2_open_charges).
  const [resolved, setResolved] = useState<MultiPaymentResolvedLine[]>([]);
  // ID do registro persistente (para UPDATE incremental).
  const [openChargeId, setOpenChargeId] = useState<string | null>(null);

  // Próxima cobrança (UI controlada).
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [tefModality, setTefModality] = useState<TefModality>('avista');
  const [tefInstallments, setTefInstallments] = useState('2');
  const [tefInstallmentType, setTefInstallmentType] = useState<'adm' | 'loja'>('adm');

  const [charging, setCharging] = useState(false);
  const [tefStatus, setTefStatus] = useState('');
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  // Flag que indica que `onConfirm` rodou com sucesso e `markCompleted`
  // já gravou status='completed'. Só liberamos a saída do modal depois disso —
  // assim, mesmo que o operador clique fora ou aperte ESC, ele não escapa de
  // uma cobrança com PinPad aprovado sem a venda ter sido registrada.
  const [completed, setCompleted] = useState(false);
  // Trava para garantir que o auto-finalizar só dispara uma vez por cobrança.
  const autoFinishedRef = useRef(false);
  // Modo de documento — só importa quando NÃO há TEF aprovado.
  // Default 'sale_only' (não emite NFC-e) — pareia com o comportamento
  // padrão do single-payment quando o operador não escolhe NFC-e.
  const [documentMode, setDocumentMode] = useState<'sale_only' | 'sale_with_nfce'>('sale_only');

  const hydratedRef = useRef(false);

  const paid = useMemo(
    () => resolved.reduce((s, l) => s + l.amount, 0),
    [resolved],
  );
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const exact = remaining < 0.005;
  const hasApproved = resolved.length > 0;
  const hasTefApproved = resolved.some((l) => l.integration && l.tef);

  const selectedMethod = methods.find((m) => m.id === paymentMethodId);
  const integration = (selectedMethod as any)?.integration_type as string | undefined;
  const isTef = integration === 'tef_pinpad' || integration === 'tef_smartpos';

  // -------- Inicialização / hidratação ao abrir --------
  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // Reset UI
    setPaymentMethodId(methods[0]?.id || '');
    setAmountText('');
    setTefModality('avista');
    setTefInstallments('2');
    setTefInstallmentType('adm');
    setTefStatus('');
    setCharging(false);
    setFinalizing(false);
    setCompleted(false);
    autoFinishedRef.current = false;
    setConfirmCancelOpen(false);
    setDocumentMode('sale_only');

    // Tenta hidratar de pdv_v2_open_charges se houver contextKey + cashRegister.
    (async () => {
      if (!companyId || !cashRegisterId || !contextKey) {
        setResolved([]);
        setOpenChargeId(null);
        return;
      }
      try {
        const { data, error } = await (supabase as any)
          .from('pdv_v2_open_charges')
          .select('id, paid_lines, paid_amount, total')
          .eq('company_id', companyId)
          .eq('cash_register_id', cashRegisterId)
          .eq('status', 'open')
          .filter('context_ref->>context_key', 'eq', contextKey)
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        const row = data?.[0];
        if (row && Array.isArray(row.paid_lines)) {
          setResolved(row.paid_lines as MultiPaymentResolvedLine[]);
          setOpenChargeId(row.id);
          toast.info(`Cobrança em aberto retomada — pago R$ ${Number(row.paid_amount).toFixed(2).replace('.', ',')}`);
        } else {
          setResolved([]);
          setOpenChargeId(null);
        }
      } catch (e) {
        console.error('[PDVV2Sequential] hydrate error', e);
        setResolved([]);
        setOpenChargeId(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // O campo "Valor" começa sempre vazio. O operador escolhe a forma e digita
  // o valor da linha. Para fechar a última, há o botão "Usar restante".
  // (Auto-fill foi removido porque induzia o operador a cobrar o total
  // inteiro na 1ª forma sem perceber.)

  // Default da forma quando lista carrega.
  useEffect(() => {
    if (open && !paymentMethodId && methods.length > 0) {
      setPaymentMethodId(methods[0].id);
    }
  }, [open, methods, paymentMethodId]);

  // -------- Persistência incremental --------
  async function persistAfterCharge(nextLines: MultiPaymentResolvedLine[]) {
    if (!companyId || !cashRegisterId || !contextKey) return;
    const nextPaid = nextLines.reduce((s, l) => s + l.amount, 0);
    try {
      if (!openChargeId) {
        const { data, error } = await (supabase as any)
          .from('pdv_v2_open_charges')
          .insert({
            company_id: companyId,
            cash_register_id: cashRegisterId,
            context: contextTypeFromKey(contextKey),
            context_ref: { context_key: contextKey, label: contextLabel },
            total,
            paid_amount: nextPaid,
            paid_lines: nextLines,
            status: 'open',
          })
          .select('id')
          .single();
        if (error) throw error;
        setOpenChargeId(data.id);
      } else {
        const { error } = await (supabase as any)
          .from('pdv_v2_open_charges')
          .update({ paid_amount: nextPaid, paid_lines: nextLines })
          .eq('id', openChargeId);
        if (error) throw error;
      }
    } catch (e) {
      console.error('[PDVV2Sequential] persist error', e);
      toast.error('Não consegui salvar o progresso da cobrança no servidor.');
    }
  }

  async function markCompleted() {
    if (!openChargeId) return;
    try {
      await (supabase as any)
        .from('pdv_v2_open_charges')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', openChargeId);
    } catch (e) {
      console.error('[PDVV2Sequential] mark completed error', e);
    }
  }

  async function markCanceled() {
    if (!openChargeId) return;
    try {
      await (supabase as any)
        .from('pdv_v2_open_charges')
        .update({ status: 'canceled', completed_at: new Date().toISOString() })
        .eq('id', openChargeId);
    } catch (e) {
      console.error('[PDVV2Sequential] mark canceled error', e);
    }
  }

  // -------- Ação: cobrar próxima --------
  async function handleChargeNext() {
    if (!companyId) return;
    const method = methods.find((m) => m.id === paymentMethodId);
    if (!method) {
      toast.error('Selecione uma forma de pagamento.');
      return;
    }
    const amount = parseCurrencyInput(amountText);
    if (amount <= 0) {
      toast.error('Informe o valor da cobrança.');
      return;
    }
    if (amount > remaining + 0.005) {
      toast.error('Valor maior que o restante da venda.');
      return;
    }

    setCharging(true);
    setTefStatus('');
    try {
      if (isTef) {
        const tefOptions: TefOptions = {
          modality: tefModality,
          installments: tefModality === 'parcelado' ? Math.max(2, parseInt(tefInstallments) || 2) : undefined,
          installmentType: tefInstallmentType,
        };
        const result = await runTefPayment({
          companyId,
          integration: integration as 'tef_pinpad' | 'tef_smartpos',
          amount,
          options: tefOptions,
          onStatus: setTefStatus,
        });
        if (!result.success) {
          // NÃO faz rollback — mantém o que já foi aprovado.
          setTefStatus('');
          return;
        }
        const ctrlMatch = result.notesFragment?.match(/\[TEF023\]([^\[]+)\[\/TEF023\]/);
        const newLine: MultiPaymentResolvedLine = {
          payment_method_id: method.id,
          payment_name: method.name,
          amount,
          integration: integration as 'tef_pinpad' | 'tef_smartpos',
          tef: result.tefData,
          tef_control_number: ctrlMatch ? ctrlMatch[1].trim() : undefined,
          notes_fragment: result.notesFragment,
        };
        const next = [...resolved, newLine];
        setResolved(next);
        await persistAfterCharge(next);
      } else {
        // Dinheiro / PIX manual / outros — apenas registra.
        const newLine: MultiPaymentResolvedLine = {
          payment_method_id: method.id,
          payment_name: method.name,
          amount,
          notes_fragment: `${method.name}: R$ ${amount.toFixed(2)}`,
        };
        const next = [...resolved, newLine];
        setResolved(next);
        await persistAfterCharge(next);
      }
    } finally {
      setCharging(false);
      setTefStatus('');
    }
  }

  // -------- Ação: finalizar (chama onConfirm do caller) --------
  async function handleFinish() {
    if (!exact || finalizing) return;
    setFinalizing(true);
    try {
      // Envia linhas já resolvidas no formato esperado pelo caller (passthrough).
      const lines: MultiPaymentInputLine[] = resolved.map((r) => ({
        payment_method_id: r.payment_method_id,
        payment_name: r.payment_name,
        amount: r.amount,
        integration: r.integration,
        _resolved: r,
      }));
      // Regra: se houver TEF aprovado → NFC-e obrigatória (auto). Senão,
      // respeita a escolha do operador. Sem módulo fiscal → nunca emite.
      const wantsNfce = fiscalEnabled && (hasTefApproved || documentMode === 'sale_with_nfce');
      await onConfirm(lines, { wantsNfce });
      await markCompleted();
      setCompleted(true);
      // Caller fecha o dialog via onOpenChange.
    } catch (e: any) {
      console.error('[PDVV2Sequential] finalize error', e);
      toast.error(e?.message || 'Falha ao finalizar a venda.');
      // Não marca como completed — modal continua travado e o operador
      // pode tentar finalizar de novo (ou cancelar com estorno).
    } finally {
      setFinalizing(false);
    }
  }

  // -------- Auto-finalizar quando o restante zerar --------
  // Quando a última cobrança aprovada zera o restante, dispara `handleFinish`
  // automaticamente — sem depender do operador clicar no botão. Isso evita
  // o cenário "TEF aprovado no PinPad mas venda nunca registrada" se o
  // operador fechar a tela / o sistema cair antes do clique manual.
  useEffect(() => {
    if (!open) return;
    if (!exact || !hasApproved) return;
    if (autoFinishedRef.current) return;
    if (charging || finalizing || rolling || processing) return;
    if (completed) return;
    autoFinishedRef.current = true;
    void handleFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exact, hasApproved, charging, finalizing, rolling, processing, completed]);

  // -------- Ação: cancelar com estorno --------
  async function handleCancelAndRefund() {
    if (rolling) return;
    setRolling(true);
    try {
      let count = 0;
      for (const ln of resolved) {
        if (ln.integration && ln.tef && companyId) {
          toast.info(`Estornando ${ln.payment_name} (R$ ${ln.amount.toFixed(2)})…`);
          const ok = await rollbackApprovedTef(companyId, ln);
          if (ok) count++;
          else toast.error(`Falha ao estornar ${ln.payment_name}. Cancele manualmente no gerenciador.`);
        }
      }
      await markCanceled();
      toast.success(`Cobrança cancelada. ${count} estorno(s) realizado(s).`);
      setResolved([]);
      setOpenChargeId(null);
      setConfirmCancelOpen(false);
      onOpenChange(false);
    } finally {
      setRolling(false);
    }
  }

  // -------- Trava de saída --------
  // Trava enquanto: há cobrança aprovada E (ainda falta valor OU a venda
  // ainda não foi marcada como completed). Só libera após `markCompleted`
  // rodar com sucesso — antes disso, fechar o modal deixaria PinPad
  // aprovado sem venda registrada.
  const locked = hasApproved && (!exact || !completed);
  const busy = charging || finalizing || rolling || processing;

  function handleOpenChangeGuarded(o: boolean) {
    if (o) return;
    if (busy) return;
    // Se nada foi aprovado ainda, sair é livre.
    if (!hasApproved) {
      onOpenChange(false);
      return;
    }
    // Cobrança concluída E venda registrada (markCompleted ok) — pode fechar.
    if (exact && completed) {
      onOpenChange(false);
      return;
    }
    // Travado — força cancelar com estorno (ou aguardar finalizar).
    setConfirmCancelOpen(true);
  }

  const statusBanner = processingStatus || tefStatus;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChangeGuarded}>
        <DialogContent
          className={
            'max-w-xl max-h-[90dvh] overflow-y-auto ' +
            (locked || busy ? '[&>button[aria-label="Close"]]:hidden [&_button.absolute.right-4.top-4]:hidden' : '')
          }
          onEscapeKeyDown={(e) => {
            if (locked || busy) e.preventDefault();
          }}
          /*
           * NÃO bloquear onPointerDownOutside / onInteractOutside aqui.
           * Os SelectContent (Radix) são renderizados em portal FORA do
           * DialogContent — bloquear esses eventos engolia cliques nos
           * itens do dropdown, prendendo a forma de pagamento na primeira
           * escolha. A trava de saída do dialog já é garantida por
           * handleOpenChangeGuarded + onEscapeKeyDown acima.
           */
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Split className="h-4 w-4" /> {title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {statusBanner && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{statusBanner}</span>
              </div>
            )}

            {locked && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs flex items-start gap-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Cobrança em andamento. O modal só libera saída após quitar todo o valor
                  ou cancelar com estorno. Se o sistema cair, ao reabrir a cobrança
                  continua de onde parou.
                </span>
              </div>
            )}

            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-semibold">{brl(total)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Pago</div>
                <div className="font-semibold text-green-600">{brl(paid)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Restante</div>
                <div className={exact ? 'font-semibold text-green-600' : 'font-semibold text-destructive'}>
                  {brl(remaining)}
                </div>
              </div>
            </div>

            {resolved.length > 0 && (
              <div className="rounded-md border divide-y">
                {resolved.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="truncate">
                        <div className="font-medium truncate">{l.payment_name}</div>
                        {l.integration && l.tef && (
                          <div className="text-xs text-muted-foreground truncate">
                            NSU {l.tef.nsu} {l.tef.bandeira ? `• ${l.tef.bandeira}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">{brl(l.amount)}</div>
                  </div>
                ))}
              </div>
            )}

            {!exact && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium">Próxima cobrança</div>
                <div className="grid grid-cols-[1fr_140px] gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Forma</Label>
                    <Select value={paymentMethodId} onValueChange={setPaymentMethodId} disabled={busy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {methods.map((m) => {
                          const itg = (m as any).integration_type as string | undefined;
                          const tef = itg === 'tef_pinpad' || itg === 'tef_smartpos';
                          return (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                              {tef ? ' (TEF)' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={amountText}
                      onChange={(e) => setAmountText(maskCurrencyInput(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      disabled={busy}
                    />
                  </div>
                </div>

                {remaining > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground -mt-1"
                    onClick={() =>
                      setAmountText(maskCurrencyInput(remaining.toFixed(2).replace('.', ',')))
                    }
                    disabled={busy}
                  >
                    Usar restante ({brl(remaining)})
                  </Button>
                )}

                {isTef && (
                  <div className="rounded-md bg-muted/30 p-2 space-y-2">
                    <Label className="text-xs text-muted-foreground">Modalidade TEF</Label>
                    <RadioGroup
                      value={tefModality}
                      onValueChange={(v) => setTefModality(v as TefModality)}
                      className="grid grid-cols-2 gap-1"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="avista" disabled={busy} /> Crédito à vista
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="debit" disabled={busy} /> Débito
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="parcelado" disabled={busy} /> Parcelado
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="pix" disabled={busy} /> PIX
                      </label>
                    </RadioGroup>
                    {tefModality === 'parcelado' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Parcelas</Label>
                          <Input
                            type="number"
                            min={2}
                            max={12}
                            value={tefInstallments}
                            onChange={(e) => setTefInstallments(e.target.value)}
                            disabled={busy}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo</Label>
                          <Select
                            value={tefInstallmentType}
                            onValueChange={(v) => setTefInstallmentType(v as 'adm' | 'loja')}
                            disabled={busy}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="adm">Admin (sem juros)</SelectItem>
                              <SelectItem value="loja">Loja (com juros)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  onClick={handleChargeNext}
                  disabled={busy || parseCurrencyInput(amountText) <= 0}
                >
                  {charging ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cobrando…
                    </>
                  ) : (
                    <>Cobrar {brl(parseCurrencyInput(amountText))}</>
                  )}
                </Button>
              </div>
            )}

            {/* Seletor de documento — só quando há módulo fiscal.
                Se há TEF aprovado, NFC-e é forçada (sem escolha). */}
            {fiscalEnabled && (
              hasTefApproved ? (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>
                    NFC-e será emitida automaticamente (uma das formas é TEF).
                  </span>
                </div>
              ) : (
                <div className="rounded-md border p-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">Documento fiscal</Label>
                  <RadioGroup
                    value={documentMode}
                    onValueChange={(v) => setDocumentMode(v as 'sale_only' | 'sale_with_nfce')}
                    className="grid grid-cols-2 gap-1"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="sale_only" disabled={busy} /> Só Venda
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="sale_with_nfce" disabled={busy} /> Venda com NFC-e
                    </label>
                  </RadioGroup>
                </div>
              )
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <div>
              {hasApproved && !exact && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCancelOpen(true)}
                  disabled={busy}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  {hasTefApproved ? 'Cancelar e estornar tudo' : 'Cancelar'}
                </Button>
              )}
              {!hasApproved && (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancelar
                </Button>
              )}
            </div>
            {exact && hasApproved && (
              <Button onClick={handleFinish} disabled={busy}>
                {finalizing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finalizando…
                  </>
                ) : (
                  <>Finalizar venda{hasTefApproved ? ' (NFC-e)' : ''}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancelOpen} onOpenChange={(o) => !rolling && setConfirmCancelOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cobrança em andamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasTefApproved ? (
                <>
                  Existe(m) <strong>{resolved.filter((l) => l.integration && l.tef).length}</strong>{' '}
                  cobrança(s) TEF aprovada(s) no valor total de{' '}
                  <strong>R$ {paid.toFixed(2).replace('.', ',')}</strong>. Ao confirmar, o sistema
                  tentará <strong>estornar todas no PinPad automaticamente</strong>. A venda NÃO será
                  registrada.
                </>
              ) : (
                <>Nenhum TEF foi aprovado ainda — a cobrança será descartada sem registrar venda.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rolling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelAndRefund();
              }}
              disabled={rolling}
            >
              {rolling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Estornando…
                </>
              ) : (
                <>Confirmar cancelamento</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}