import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Modal de Cliente para Frente de Caixa — inspirado no Gweb:
 * - Modo "search": campo único (CPF/nome/telefone) com lista de resultados.
 * - Botão "USAR CPF AVULSO" → preenche só o documento, sem cadastrar.
 * - Modo "create": formulário curto (Nome, Telefone, CPF) — insere em `customers`.
 * Não altera nenhum outro fluxo: apenas devolve {name, phone, document} para o checkout.
 */

export interface FrenteCaixaCustomerPick {
  name?: string;
  phone?: string;
  document?: string;
  address?: string;
  city?: string;
  state?: string;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  cpf: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  onPick: (c: FrenteCaixaCustomerPick) => void;
  /**
   * Quando `true` (ex.: venda no crediário), exige cadastro completo:
   * nome, CPF, telefone e endereço. Desabilita "USAR CPF AVULSO" e
   * bloqueia confirmação de clientes com cadastro incompleto.
   */
  requireFull?: boolean;
}

function onlyDigits(s: string) {
  return (s || '').replace(/\D+/g, '');
}

export function FrenteCaixaCustomerDialog({ open, onOpenChange, companyId, onPick, requireFull = false }: Props) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [cpfArmed, setCpfArmed] = useState(false);

  // create form
  const [form, setForm] = useState({ name: '', phone: '', cpf: '', address: '', city: '', state: '' });
  const [saving, setSaving] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode('search');
      setQuery('');
      setResults([]);
      setSelected(null);
      setCpfArmed(false);
      setForm({ name: '', phone: '', cpf: '', address: '', city: '', state: '' });
      setSaving(false);
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (mode === 'create') setTimeout(() => nameRef.current?.focus(), 60);
  }, [mode]);

  // debounce search
  useEffect(() => {
    if (!open || mode !== 'search' || !companyId) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const digits = onlyDigits(q);
        let req = supabase
          .from('customers')
          .select('id,name,phone,cpf,address,city,state')
          .eq('company_id', companyId)
          .order('name', { ascending: true })
          .limit(20);
        if (digits.length >= 3) {
          // busca por dígitos (telefone OU cpf) ou nome
          req = req.or(
            `phone.ilike.%${digits}%,cpf.ilike.%${digits}%,name.ilike.%${q}%`,
          );
        } else {
          req = req.ilike('name', `%${q}%`);
        }
        const { data, error } = await req;
        if (error) throw error;
        setResults((data as CustomerRow[]) || []);
      } catch (e) {
        console.error('[FrenteCaixaCustomerDialog] search error', e);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [query, open, mode, companyId]);

  const selectedMissing = requireFull && selected
    ? [
        !selected.name?.trim() && 'nome',
        !selected.cpf?.trim() && 'CPF',
        !selected.phone?.trim() && 'telefone',
        !selected.address?.trim() && 'endereço',
      ].filter(Boolean) as string[]
    : [];

  function handleConfirmSelected() {
    if (!selected) return;
    if (selectedMissing.length > 0) {
      toast.error(`Cadastro incompleto: falta ${selectedMissing.join(', ')}. Cadastre uma nova pessoa ou complete o cadastro deste cliente na tela Clientes.`);
      return;
    }
    onPick({
      name: selected.name || undefined,
      phone: selected.phone || undefined,
      document: selected.cpf || undefined,
      address: selected.address || undefined,
      city: selected.city || undefined,
      state: selected.state || undefined,
    });
    onOpenChange(false);
  }

  function handleUseRawCpf() {
    if (requireFull) {
      toast.error('Na venda no crediário, o cadastro completo é obrigatório.');
      return;
    }
    const digits = onlyDigits(query);
    if (digits.length < 11) {
      toast.error('Digite um CPF (11 dígitos) ou CNPJ (14 dígitos).');
      return;
    }
    onPick({ document: digits });
    onOpenChange(false);
  }

  async function handleCreate() {
    if (!companyId) return;
    const name = form.name.trim();
    const phone = form.phone.trim();
    const cpf = form.cpf.trim();
    const address = form.address.trim();
    const city = form.city.trim();
    const state = form.state.trim();
    if (!name) {
      toast.error('Nome é obrigatório.');
      return;
    }
    if (!phone) {
      toast.error('Telefone é obrigatório.');
      return;
    }
    if (requireFull) {
      if (!cpf) {
        toast.error('CPF é obrigatório para venda no crediário.');
        return;
      }
      if (!address) {
        toast.error('Endereço é obrigatório para venda no crediário.');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        name,
        phone,
        cpf: cpf || null,
        address: address || null,
        city: city || null,
        state: state || null,
      };
      const { data, error } = await supabase
        .from('customers')
        .insert(payload)
        .select('id,name,phone,cpf,address,city,state')
        .single();
      if (error) throw error;
      toast.success('Cliente cadastrado.');
      onPick({
        name: data?.name || name,
        phone: data?.phone || phone,
        document: data?.cpf || cpf || undefined,
        address: data?.address || address || undefined,
        city: data?.city || city || undefined,
        state: data?.state || state || undefined,
      });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[FrenteCaixaCustomerDialog] create error', e);
      toast.error(e?.message || 'Erro ao cadastrar cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {mode === 'search' ? (
          <div className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Buscar pessoas (clientes)</h2>
              <p className="text-xs text-muted-foreground mt-1">
                CPF/CNPJ, nome ou telefone
              </p>
              {requireFull && (
                <p className="mt-2 text-[11px] text-amber-500">
                  Venda no crediário: cadastro completo obrigatório (nome, CPF, telefone e endereço).
                </p>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setCpfArmed(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selected) {
                    e.preventDefault();
                    handleConfirmSelected();
                    return;
                  }
                  if (e.key === 'Enter' && !selected && onlyDigits(query).length >= 11) {
                    e.preventDefault();
                    setCpfArmed(true);
                  }
                }}
                placeholder="Digite para buscar…"
                className="pl-6 border-0 border-b border-foreground/40 rounded-none focus-visible:ring-0 focus-visible:border-primary bg-transparent"
              />
            </div>

            {!requireFull && onlyDigits(query).length >= 11 && !selected && (
              <p className="mt-2 text-xs text-muted-foreground">
                {cpfArmed ? (
                  <>
                    CPF/CNPJ <strong className="text-foreground">{onlyDigits(query)}</strong> pronto. Clique em <strong>CONFIRMAR</strong>.
                  </>
                ) : (
                  <>
                    Pressione <kbd className="px-1.5 py-0.5 border rounded text-[10px] font-mono">Enter</kbd> para informar somente o CPF/CNPJ
                  </>
                )}
              </p>
            )}

            {requireFull && selected && selectedMissing.length > 0 && (
              <p className="mt-2 text-xs text-destructive">
                Cadastro incompleto — falta {selectedMissing.join(', ')}. Cadastre uma nova pessoa abaixo.
              </p>
            )}

            <div className="mt-4 min-h-[160px] max-h-[280px] overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando…
                </div>
              )}
              {!loading && query.trim().length >= 2 && results.length === 0 && onlyDigits(query).length < 11 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <p>Nenhum cliente encontrado.</p>
                </div>
              )}
              {!loading && results.length > 0 && (
                <ul className="divide-y divide-border">
                  {results.map((c) => {
                    const isSel = selected?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(c)}
                          onDoubleClick={() => {
                            setSelected(c);
                            setTimeout(() => handleConfirmSelected(), 0);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors ${
                            isSel ? 'bg-muted' : ''
                          }`}
                        >
                          <div className="text-sm font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.phone || '—'}
                            {c.cpf ? ` • CPF ${c.cpf}` : ''}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!loading && query.trim().length < 2 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Comece a digitar para buscar…
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode('create')}
                className="text-foreground"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                NOVO CLIENTE
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  CANCELAR
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    requireFull
                      ? !selected || selectedMissing.length > 0
                      : !selected && !cpfArmed
                  }
                  onClick={() => {
                    if (selected) handleConfirmSelected();
                    else if (cpfArmed) handleUseRawCpf();
                  }}
                >
                  CONFIRMAR
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMode('search')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold">Novo cliente</h2>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nome completo *</Label>
                <Input
                  ref={nameRef}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Telefone *</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">CPF {requireFull ? '*' : ''}</Label>
                  <Input
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                    disabled={saving}
                    placeholder={requireFull ? '' : '(opcional)'}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Endereço {requireFull ? '*' : ''}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  disabled={saving}
                  placeholder="Rua, número, bairro"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Cidade</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">UF</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
                    disabled={saving}
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                CANCELAR
              </Button>
              <Button type="button" size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando…
                  </>
                ) : (
                  'SALVAR E USAR'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
