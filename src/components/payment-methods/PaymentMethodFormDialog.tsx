import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bike, Store, Plug } from 'lucide-react';
import type { PaymentChannel, PaymentMethod } from '@/hooks/usePaymentMethods';

export type PaymentMethodDraft = Partial<PaymentMethod> & {
  name: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: PaymentChannel;
  mode: 'create' | 'edit';
  initial?: Partial<PaymentMethod> | null;
  busy: boolean;
  onSubmit: (data: PaymentMethodDraft) => Promise<boolean>;
}

/** Códigos oficiais do SEFAZ para o campo tPag da NF-e/NFC-e. */
const NFE_CODES: { code: string; label: string }[] = [
  { code: '01', label: '01 — Dinheiro' },
  { code: '02', label: '02 — Cheque' },
  { code: '03', label: '03 — Cartão de Crédito' },
  { code: '04', label: '04 — Cartão de Débito' },
  { code: '05', label: '05 — Crédito Loja / Crediário' },
  { code: '10', label: '10 — Vale Alimentação' },
  { code: '11', label: '11 — Vale Refeição' },
  { code: '12', label: '12 — Vale Presente' },
  { code: '13', label: '13 — Vale Combustível' },
  { code: '15', label: '15 — Boleto Bancário' },
  { code: '16', label: '16 — Depósito Bancário' },
  { code: '17', label: '17 — PIX' },
  { code: '18', label: '18 — Transferência Bancária / Carteira Digital' },
  { code: '19', label: '19 — Cashback / Crédito Virtual' },
  { code: '90', label: '90 — Sem Pagamento (Pagamento Posterior)' },
  { code: '99', label: '99 — Outros' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-foreground/90">{title}</h3>
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, hint, counter, children }: {
  label: string; required?: boolean; hint?: string; counter?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="border-b border-border pb-1">{children}</div>
      {(hint || counter) && (
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{hint}</span>
          {counter && <span>{counter}</span>}
        </div>
      )}
    </div>
  );
}

const bare = 'bg-transparent border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-base';

export function PaymentMethodFormDialog({
  open, onOpenChange, channel, mode, initial, busy, onSubmit,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [paymentType, setPaymentType] = useState<'a_vista' | 'a_prazo' | 'crediario'>('a_vista');
  const [nfeRef, setNfeRef] = useState<string>('');
  const [active, setActive] = useState(true);
  const [issueNfce, setIssueNfce] = useState(false);
  const [installments, setInstallments] = useState(1);
  const [interval, setInterval] = useState(1);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [startRule, setStartRule] = useState<'general' | 'fixed_days' | 'next_month'>('general');

  // Legado — mantidos para não perder funcionalidade existente
  const [pixKey, setPixKey] = useState('');
  const [integration, setIntegration] = useState<string>('none');
  const [showDelivery, setShowDelivery] = useState(true);
  const [showPickup, setShowPickup] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setPaymentType((initial?.payment_type as any) ?? 'a_vista');
    setNfeRef(initial?.nfe_ref_code ?? '');
    setActive(initial?.active ?? true);
    setIssueNfce(initial?.issue_nfce ?? false);
    setInstallments(initial?.installments_count ?? 1);
    setInterval(initial?.installment_interval ?? 1);
    setPeriod((initial?.installment_period as any) ?? 'month');
    setStartRule((initial?.installment_start_rule as any) ?? 'general');
    setPixKey(initial?.pix_key ?? '');
    setIntegration(initial?.integration_type ?? 'none');
    setShowDelivery(initial?.show_for_delivery ?? true);
    setShowPickup(initial?.show_for_pickup ?? true);
  }, [open, initial]);

  const isPix = name.toLowerCase().includes('pix');
  const isPrazo = paymentType === 'a_prazo' || paymentType === 'crediario';
  const canSave = name.trim().length > 0 && !!nfeRef;
  const showModalitySplit = channel === 'menu' || channel === 'express';
  const showIntegration = channel === 'pdv' || channel === 'express';

  const handle = async () => {
    const draft: PaymentMethodDraft = {
      name: name.trim(),
      description: description.trim() || null,
      payment_type: paymentType,
      nfe_ref_code: nfeRef || null,
      active,
      issue_nfce: issueNfce,
      installments_count: isPrazo ? Math.max(1, installments) : 1,
      installment_interval: isPrazo ? Math.max(1, interval) : 1,
      installment_period: period,
      installment_start_rule: startRule,
      pix_key: isPix ? (pixKey.trim() || null) : null,
      integration_type: showIntegration && integration !== 'none' ? integration : null,
      show_for_delivery: showModalitySplit ? showDelivery : true,
      show_for_pickup: showModalitySplit ? showPickup : true,
    };
    const ok = await onSubmit(draft);
    if (ok) onOpenChange(false);
  };

  const title = mode === 'create' ? 'Nova forma de pagamento' : 'Editando forma de pagamento';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Section title="Identificação">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome da forma de pagamento" required counter={`${name.length} / 30`}>
                <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} className={bare} placeholder="Ex.: Crediário" />
              </Field>
              <Field label="Descrição" counter={`${description.length} / 250`}>
                <Input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 250))} className={bare} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tipo de pagamento" required>
                <Select value={paymentType} onValueChange={(v: any) => setPaymentType(v)}>
                  <SelectTrigger className={bare}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_vista">À vista</SelectItem>
                    <SelectItem value="a_prazo">A prazo</SelectItem>
                    <SelectItem value="crediario">Crediário</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Referência na NF-e" required>
                <Select value={nfeRef} onValueChange={setNfeRef}>
                  <SelectTrigger className={bare}><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {NFE_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2">
                <Checkbox checked={active} onCheckedChange={(c) => setActive(!!c)} />
                <span className="text-sm">Ativo</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={issueNfce} onCheckedChange={(c) => setIssueNfce(!!c)} />
                <span className="text-sm">Emitir NFC-e ao finalizar venda</span>
              </label>
            </div>
          </Section>

          {isPrazo && (
            <Section title="Parcelamento">
              <Field label="Nº de parcelas">
                <Input type="number" min={1} max={60} value={installments}
                  onChange={(e) => setInstallments(Math.max(1, Number(e.target.value) || 1))} className={bare} />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Intervalo">
                  <Input type="number" min={1} max={365} value={interval}
                    onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))} className={bare} />
                </Field>
                <Field label="Período">
                  <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                    <SelectTrigger className={bare}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Dia</SelectItem>
                      <SelectItem value="week">Semana</SelectItem>
                      <SelectItem value="month">Mês</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Data inicial do parcelamento" required>
                  <Select value={startRule} onValueChange={(v: any) => setStartRule(v)}>
                    <SelectTrigger className={bare}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">Utilizar configuração geral</SelectItem>
                      <SelectItem value="fixed_days">Somar intervalo à emissão</SelectItem>
                      <SelectItem value="next_month">Próximo mês (mesma data)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Section>
          )}

          {(isPix || showIntegration || showModalitySplit) && (
            <Section title="Ajustes do canal">
              {isPix && (
                <Field label="Chave PIX" hint="Exibida ao cliente no cardápio quando aplicável">
                  <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} className={bare} />
                </Field>
              )}
              {showIntegration && (
                <Field label="Integração" hint="Aciona TEF automaticamente ao selecionar esta forma no PDV">
                  <Select value={integration} onValueChange={setIntegration}>
                    <SelectTrigger className={bare}>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      <SelectItem value="tef_pinpad">TEF PinPad (WebService)</SelectItem>
                      <SelectItem value="tef_smartpos">TEF SmartPOS (PINPDV)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {showModalitySplit && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Disponível em</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm flex items-center gap-2"><Bike className="w-4 h-4" /> Entrega</span>
                    <Switch checked={showDelivery} onCheckedChange={setShowDelivery} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm flex items-center gap-2"><Store className="w-4 h-4" /> Retirada</span>
                    <Switch checked={showPickup} onCheckedChange={setShowPickup} />
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handle} disabled={busy || !canSave}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}