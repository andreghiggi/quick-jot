import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Search } from 'lucide-react';
import { maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';

export interface NewFinancePayload {
  amount: number;
  issueDate: string;
  dueDate: string;
  alreadyPaid: boolean;
  installments: number;
  installmentIntervalDays: number;
  partyName: string;
  documentNumber: string;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'receita' | 'despesa';
  busy: boolean;
  onSubmit: (payload: NewFinancePayload) => Promise<boolean>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-foreground/90">{title}</h3>
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({
  label, required, hint, counter, children,
}: { label: string; required?: boolean; hint?: string; counter?: string; children: React.ReactNode }) {
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

export function NewFinanceEntryDialog({ open, onOpenChange, kind, busy, onSubmit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const isReceita = kind === 'receita';
  const partyLabel = isReceita ? 'Cliente' : 'Fornecedor';
  const paidLabel = isReceita ? 'Recebida' : 'Paga';
  const docHint = `Nº do documento que identifique a ${kind}`;
  const descHint = `Descrição opcional da ${kind}`;

  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [installments, setInstallments] = useState(1);
  const [interval, setInterval] = useState(30);
  const [parcelamentoOn, setParcelamentoOn] = useState(false);
  const [party, setParty] = useState('');
  const [doc, setDoc] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(''); setIssueDate(today); setDueDate(today);
      setAlreadyPaid(false); setInstallments(1); setInterval(30);
      setParcelamentoOn(false); setParty(''); setDoc(''); setDesc('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSave = parseCurrencyInput(amount) > 0 && !!issueDate && !!dueDate;

  const handle = async () => {
    const ok = await onSubmit({
      amount: parseCurrencyInput(amount),
      issueDate, dueDate, alreadyPaid,
      installments: parcelamentoOn ? Math.max(1, installments) : 1,
      installmentIntervalDays: interval,
      partyName: party.trim(),
      documentNumber: doc.trim(),
      description: desc.trim(),
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Nova {kind}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Section title={`Dados da ${kind}`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-end">
              <Field label="Valor" required>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(maskCurrencyInput(e.target.value))}
                  inputMode="decimal" placeholder="R$ 0,00"
                  className={`${bare} text-right`}
                />
              </Field>
              <label className="flex items-center gap-2 pb-2">
                <Checkbox checked={alreadyPaid} onCheckedChange={(c) => setAlreadyPaid(!!c)} />
                <span className="text-sm">{paidLabel}</span>
              </label>
              <label className="flex items-center gap-2 pb-2">
                <Checkbox checked={parcelamentoOn} onCheckedChange={(c) => { setParcelamentoOn(!!c); if (!c) setInstallments(1); }} />
                <span className="text-sm">Parcelamento</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Emissão" required>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={bare} />
              </Field>
              <Field label="Vencimento" required>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={bare} />
              </Field>
            </div>

            {parcelamentoOn && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-border">
                <Field label="Nº de parcelas">
                  <Input type="number" min={1} max={60} value={installments}
                    onChange={(e) => setInstallments(Math.max(1, Number(e.target.value) || 1))} className={bare} />
                </Field>
                <Field label="Intervalo (dias)">
                  <Input type="number" min={1} max={365} value={interval}
                    onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 30))} className={bare} />
                </Field>
              </div>
            )}
          </Section>

          <Section title={partyLabel}>
            <Field label={partyLabel}
              hint="Digite o código, ou faça a busca aprimorada...">
              <div className="flex items-center gap-2">
                <Input value={party} onChange={(e) => setParty(e.target.value)}
                  placeholder={`Nome do ${partyLabel.toLowerCase()}`} className={bare} />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled title="Cadastro rápido — em breve">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled title="Busca aprimorada — em breve">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          </Section>

          <Section title="Identificação">
            <Field label="Documento" hint={docHint} counter={`${doc.length}/60`}>
              <Input value={doc} onChange={(e) => setDoc(e.target.value.slice(0, 60))} className={bare} />
            </Field>
            <Field label="Descrição" hint={descHint} counter={`${desc.length}/2000`}>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 2000))} rows={2}
                className={`${bare} resize-none min-h-[36px]`} />
            </Field>
          </Section>

          <Section title="Vínculos">
            <Field label="Plano de contas" hint="Em breve — cadastre em Financeiro > Planos de contas">
              <Input disabled placeholder="Selecione um plano de contas" className={bare} />
            </Field>
            <Field label="Centro de custos" hint="Em breve — cadastre em Financeiro > Centros de custos">
              <Input disabled placeholder="Selecione um centro de custo" className={bare} />
            </Field>
          </Section>
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