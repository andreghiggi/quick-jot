import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus, Trash2, Loader2, Search, Barcode, DollarSign, Truck,
} from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Tela "Nova compra" — cadastro manual de nota de compra, alinhada 1:1 com a
 * tela equivalente do GWeb (Cabeçalho · Fornecedor · Produtos · Pagamentos ·
 * Transporte). Não substitui o fluxo de Importar XML: aqui o usuário digita
 * tudo na mão. Salvar e concluir grava em purchase_invoices + items e dispara
 * apply_stock_movement (mesmo mecanismo do XML).
 */

// --------- types ----------
type ProductSlim = { id: string; name: string; gtin: string | null; price?: number | null; cost_price?: number | null };
type SupplierSlim = { id: string; name: string; document: string | null };
type PaymentMethodSlim = { id: string; name: string };

type ItemRow = {
  product_id: string | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
};

type PaymentRow = {
  payment_method_id: string | null;
  forma: string;
  valor: number;
};

const FRETE_OPTIONS = [
  { value: 'sem_transporte', label: 'Sem Transporte' },
  { value: 'emitente', label: 'Por conta do emitente' },
  { value: 'destinatario', label: 'Por conta do destinatário' },
  { value: 'terceiros', label: 'Por conta de terceiros' },
  { value: 'proprio_remetente', label: 'Transporte próprio (remetente)' },
  { value: 'proprio_destinatario', label: 'Transporte próprio (destinatário)' },
];

const headerSchema = z.object({
  numero: z.string().trim().min(1, 'Número é obrigatório').max(20),
  modelo: z.string().trim().min(1, 'Modelo é obrigatório').max(3),
  serie: z.string().trim().min(1, 'Série é obrigatória').max(5),
  chave_acesso: z.string().trim().max(44).optional(),
  data_emissao: z.string().min(1, 'Emissão é obrigatória'),
});

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function nowHM(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
function brl(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function NovaCompra() {
  const { company } = useAuthContext();
  const navigate = useNavigate();

  // ---- Cabeçalho ----
  const [numero, setNumero] = useState('');
  const [modelo, setModelo] = useState('55');
  const [serie, setSerie] = useState('');
  const [chave, setChave] = useState('');
  const [emissaoData, setEmissaoData] = useState(todayISO());
  const [emissaoHora, setEmissaoHora] = useState(nowHM());
  const [entradaData, setEntradaData] = useState(todayISO());
  const [entradaHora, setEntradaHora] = useState(nowHM());
  const [natureza, setNatureza] = useState('Compra de mercadorias');

  // ---- Fornecedor ----
  const [suppliers, setSuppliers] = useState<SupplierSlim[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);

  // ---- Produtos ----
  const [products, setProducts] = useState<ProductSlim[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  // ---- Pagamentos ----
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSlim[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  // ---- Transporte ----
  const [tipoFrete, setTipoFrete] = useState('sem_transporte');

  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Loads paralelos ----
  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      const [sup, prod, pm] = await Promise.all([
        supabase.from('suppliers').select('id,name,document').eq('company_id', company.id).eq('active', true).order('name'),
        supabase.from('products').select('id,name,gtin,price,cost_price').eq('company_id', company.id).eq('active', true).order('name'),
        supabase.from('payment_methods').select('id,name').eq('company_id', company.id).eq('active', true).order('name'),
      ]);
      setSuppliers((sup.data as any) || []);
      setProducts((prod.data as any) || []);
      setPaymentMethods((pm.data as any) || []);
    })();
  }, [company?.id]);

  // ---- Totais ----
  const totalProdutos = useMemo(
    () => items.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0),
    [items],
  );
  const totalPagamentos = useMemo(
    () => payments.reduce((s, p) => s + (p.valor || 0), 0),
    [payments],
  );
  const supplier = useMemo(
    () => suppliers.find(s => s.id === supplierId) || null,
    [suppliers, supplierId],
  );

  const headerError = useMemo(() => {
    const r = headerSchema.safeParse({
      numero, modelo, serie, chave_acesso: chave || undefined, data_emissao: emissaoData,
    });
    return r.success ? null : r.error.issues[0].message;
  }, [numero, modelo, serie, chave, emissaoData]);

  // ---- Item handlers ----
  function addItem(productId?: string) {
    const p = productId ? products.find(x => x.id === productId) : null;
    setItems(prev => [...prev, {
      product_id: p?.id || null,
      descricao: p?.name || '',
      quantidade: 1,
      valor_unitario: p?.cost_price || p?.price || 0,
    }]);
  }
  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ---- Payment handlers ----
  function addPayment() {
    const restante = Math.max(0, totalProdutos - totalPagamentos);
    setPayments(prev => [...prev, {
      payment_method_id: paymentMethods[0]?.id || null,
      forma: paymentMethods[0]?.name || 'Dinheiro',
      valor: restante,
    }]);
  }
  function updatePayment(idx: number, patch: Partial<PaymentRow>) {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function removePayment(idx: number) {
    setPayments(prev => prev.filter((_, i) => i !== idx));
  }

  // ---- Save ----
  async function save(concluir: boolean) {
    if (!company?.id) return;
    setTouched(true);
    if (headerError) {
      toast.error(headerError);
      return;
    }
    if (concluir && !supplierId) {
      toast.error('Informe o fornecedor para concluir a entrada');
      return;
    }
    if (concluir && items.length === 0) {
      toast.error('Adicione ao menos um produto para concluir');
      return;
    }
    if (concluir && payments.length > 0 && Math.abs(totalPagamentos - totalProdutos) > 0.01) {
      toast.error('Soma dos pagamentos deve igualar o total dos produtos');
      return;
    }

    setSaving(true);
    try {
      const emissaoISO = new Date(`${emissaoData}T${emissaoHora || '00:00'}:00`).toISOString();
      const entradaISO = entradaData
        ? new Date(`${entradaData}T${entradaHora || '00:00'}:00`).toISOString()
        : null;

      const { data: inv, error: invErr } = await supabase.from('purchase_invoices').insert({
        company_id: company.id,
        supplier_id: supplierId,
        nome_emitente: supplier?.name || null,
        cnpj_emitente: supplier?.document || null,
        numero_nfe: numero,
        serie,
        modelo,
        chave_acesso: chave || null,
        data_emissao: emissaoISO,
        data_entrada: entradaISO,
        natureza_operacao: natureza,
        tipo_frete: tipoFrete,
        valor_total: totalProdutos,
        pagamentos: payments.map(p => ({
          payment_method_id: p.payment_method_id,
          forma: p.forma,
          valor: p.valor,
        })),
        origem: 'manual',
        status: concluir ? 'lancada' : 'rascunho',
      } as any).select('id').single();
      if (invErr) throw invErr;
      const invoiceId = (inv as any).id;

      for (const it of items) {
        await supabase.from('purchase_invoice_items').insert({
          invoice_id: invoiceId,
          company_id: company.id,
          product_id: it.product_id,
          xml_descricao: it.descricao,
          quantidade: it.quantidade,
          valor_unitario: it.valor_unitario,
          valor_total: it.quantidade * it.valor_unitario,
          stock_applied: concluir && !!it.product_id,
        } as any);

        if (concluir && it.product_id) {
          await supabase.rpc('apply_stock_movement', {
            _product_id: it.product_id,
            _qty: it.quantidade,
            _type: 'entrada',
            _reference_type: 'purchase_invoice',
            _reference_id: invoiceId,
            _notes: `NF ${numero}/${serie} - ${supplier?.name || ''}`,
          });
        }
      }

      toast.success(concluir ? 'Compra lançada e estoque atualizado!' : 'Rascunho salvo.');
      navigate('/compras');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao salvar compra');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl pb-28">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-6">Nova compra</h1>

        {/* CABEÇALHO */}
        <Section title="Cabeçalho">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px] gap-3">
            <Field label="Número" required error={touched && !numero ? 'Campo obrigatório' : null}>
              <Input value={numero} onChange={e => setNumero(e.target.value)} />
            </Field>
            <Field label="Modelo" required>
              <Input value={modelo} onChange={e => setModelo(e.target.value)} />
            </Field>
            <Field label="Série" required error={touched && !serie ? 'Campo obrigatório' : null}>
              <Input value={serie} onChange={e => setSerie(e.target.value)} />
            </Field>
          </div>

          <Field label="Chave de acesso">
            <Input
              value={chave}
              onChange={e => setChave(e.target.value.replace(/\D/g, '').slice(0, 44))}
              placeholder="44 dígitos (opcional)"
              className="font-mono"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Emissão *</Label>
              <div className="flex gap-2">
                <Input type="date" value={emissaoData} onChange={e => setEmissaoData(e.target.value)} />
                <Input type="time" value={emissaoHora} onChange={e => setEmissaoHora(e.target.value)} className="w-28" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Entrada</Label>
              <div className="flex gap-2">
                <Input type="date" value={entradaData} onChange={e => setEntradaData(e.target.value)} />
                <Input type="time" value={entradaHora} onChange={e => setEntradaHora(e.target.value)} className="w-28" />
              </div>
            </div>
            <Field label="Natureza da operação">
              <Input value={natureza} onChange={e => setNatureza(e.target.value)} />
              <Badge variant="secondary" className="mt-1 text-[10px] bg-primary/10 text-primary border-primary/20">Entrada</Badge>
            </Field>
          </div>
        </Section>

        {/* FORNECEDOR */}
        <Section title="Fornecedor">
          <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 h-12 rounded-md border border-input bg-background text-left hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  {supplier ? (
                    <>
                      <div className="font-medium truncate">{supplier.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{supplier.document || 'Sem CNPJ/CPF'}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm">Fornecedor</div>
                      <div className="text-xs text-muted-foreground">Digite o código, ou faça a busca aprimorada…</div>
                    </>
                  )}
                </div>
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(560px,90vw)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar por nome ou CNPJ…" />
                <CommandList>
                  <CommandEmpty>
                    Nenhum fornecedor encontrado.{' '}
                    <button
                      type="button"
                      onClick={() => { setSupplierOpen(false); navigate('/fornecedores'); }}
                      className="text-primary underline underline-offset-2"
                    >
                      Cadastrar novo
                    </button>
                  </CommandEmpty>
                  <CommandGroup>
                    {suppliers.map(s => (
                      <CommandItem
                        key={s.id}
                        value={`${s.name} ${s.document || ''}`}
                        onSelect={() => { setSupplierId(s.id); setSupplierOpen(false); }}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.document || 'Sem CNPJ/CPF'}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </Section>

        {/* PRODUTOS */}
        <Section
          title="Produtos"
          headerExtra={
            <Badge variant="outline" className="font-mono">
              Total: <span className="ml-1 text-emerald-600 font-semibold">{brl(totalProdutos)}</span>
            </Badge>
          }
        >
          {!supplierId ? (
            <div className="text-center text-muted-foreground py-6 text-sm">
              Informe o fornecedor para adicionar os itens
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm mb-3">Nenhum item adicionado.</p>
              <Button variant="outline" size="sm" onClick={() => addItem()}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar produto
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:grid grid-cols-[1fr_100px_120px_120px_40px] gap-2 text-xs text-muted-foreground px-2">
                <span>Produto</span><span className="text-right">Qtd</span>
                <span className="text-right">V. unit.</span><span className="text-right">Total</span><span />
              </div>
              {items.map((it, idx) => (
                <ItemRowEditor
                  key={idx}
                  row={it}
                  products={products}
                  onChange={patch => updateItem(idx, patch)}
                  onRemove={() => removeItem(idx)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={() => addItem()}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar produto
              </Button>
            </div>
          )}
        </Section>

        {/* PAGAMENTOS */}
        <Section
          title="Pagamentos"
          headerExtra={
            totalProdutos > 0 ? (
              <Badge variant="outline" className="font-mono">
                Pago: <span className={`ml-1 font-semibold ${Math.abs(totalPagamentos - totalProdutos) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {brl(totalPagamentos)} / {brl(totalProdutos)}
                </span>
              </Badge>
            ) : null
          }
        >
          {totalProdutos === 0 ? (
            <div className="text-center text-muted-foreground py-6 text-sm">
              Adicione as formas de pagamento quando o documento tiver valor
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_140px_40px] gap-2 items-center">
                  <Select
                    value={p.payment_method_id || ''}
                    onValueChange={(v) => {
                      const pm = paymentMethods.find(x => x.id === v);
                      updatePayment(idx, { payment_method_id: v, forma: pm?.name || '' });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Forma" /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" step="0.01" min="0"
                    value={p.valor}
                    onChange={e => updatePayment(idx, { valor: parseFloat(e.target.value) || 0 })}
                    className="text-right font-mono"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removePayment(idx)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addPayment} disabled={paymentMethods.length === 0}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar pagamento
              </Button>
              {paymentMethods.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma forma cadastrada. <button onClick={() => navigate('/formas-pagamento')} className="text-primary underline">Cadastrar agora</button>
                </p>
              )}
            </div>
          )}
        </Section>

        {/* TRANSPORTE */}
        <Section title="Transporte">
          <Field label="Tipo de frete">
            <Select value={tipoFrete} onValueChange={setTipoFrete}>
              <SelectTrigger className="md:w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FRETE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </Section>
      </div>

      {/* RODAPÉ FIXO (estilo GWeb) */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-30">
        <div className="container max-w-6xl flex items-center justify-end gap-2 py-3">
          <Button variant="ghost" onClick={() => navigate('/compras')} disabled={saving}>
            VOLTAR
          </Button>
          <Button variant="ghost" onClick={() => save(true)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            SALVAR E CONCLUIR
          </Button>
          <Button onClick={() => save(false)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            SALVAR
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

// ---------- helpers ----------
function Section({ title, headerExtra, children }: { title: string; headerExtra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {headerExtra}
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <Label className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
        {label} {required && '*'}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

function ItemRowEditor({
  row, products, onChange, onRemove,
}: {
  row: ItemRow;
  products: ProductSlim[];
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.id === row.product_id);
  const total = (row.quantidade || 0) * (row.valor_unitario || 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_120px_40px] gap-2 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-10 px-3 rounded-md border border-input bg-background text-left text-sm hover:bg-muted/50 transition-colors truncate"
          >
            {selected?.name || row.descricao || <span className="text-muted-foreground">Selecionar produto…</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(480px,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar produto…" />
            <CommandList>
              <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
              <CommandGroup>
                {products.slice(0, 200).map(p => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.gtin || ''}`}
                    onSelect={() => {
                      onChange({
                        product_id: p.id,
                        descricao: p.name,
                        valor_unitario: row.valor_unitario || p.cost_price || p.price || 0,
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{p.name}</span>
                      {p.gtin && <span className="text-xs text-muted-foreground font-mono">{p.gtin}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        type="number" step="0.001" min="0"
        value={row.quantidade}
        onChange={e => onChange({ quantidade: parseFloat(e.target.value) || 0 })}
        className="text-right font-mono h-10"
      />
      <Input
        type="number" step="0.01" min="0"
        value={row.valor_unitario}
        onChange={e => onChange({ valor_unitario: parseFloat(e.target.value) || 0 })}
        className="text-right font-mono h-10"
      />
      <div className="text-right font-mono text-sm font-semibold text-emerald-600 px-2">
        {brl(total)}
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} className="h-10 w-10">
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}