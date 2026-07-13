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
  number: string | null;
  neighborhood: string | null;
  complement: string | null;
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

/** Máscara BR de telefone: (99) 9999-9999 ou (99) 99999-9999. Não limita quantos dígitos digitar. */
function maskPhoneBR(v: string) {
  const d = onlyDigits(v);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  // aceita mais dígitos que 11 (usuário pediu poder digitar quantos quiser)
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Máscara CPF/CNPJ: XXX.XXX.XXX-XX ou XX.XXX.XXX/XXXX-XX. Não limita entrada. */
function maskCpfCnpj(v: string) {
  const d = onlyDigits(v);
  if (d.length === 0) return '';
  if (d.length <= 11) {
    // CPF
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }
  // CNPJ
  if (d.length <= 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/** Aceita fixo (10 dígitos) ou celular (11 dígitos) BR. DDD 11–99. */
function isValidBrPhone(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  // celular deve começar com 9
  if (d.length === 11 && d[2] !== '9') return false;
  return true;
}

export function FrenteCaixaCustomerDialog({ open, onOpenChange, companyId, onPick, requireFull = false }: Props) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [cpfArmed, setCpfArmed] = useState(false);

  // create form
  const [form, setForm] = useState({
    name: '', phone: '', cpf: '',
    address: '', number: '', neighborhood: '', complement: '', reference: '',
    city: '', state: '',
  });
  const [saving, setSaving] = useState(false);
  /** Quando preenchido, o formulário "create" faz UPDATE deste cliente. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode('search');
      setQuery('');
      setResults([]);
      setSelected(null);
      setCpfArmed(false);
      setForm({
        name: '', phone: '', cpf: '',
        address: '', number: '', neighborhood: '', complement: '', reference: '',
        city: '', state: '',
      });
      setSaving(false);
      setEditingId(null);
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
          .select('id,name,phone,cpf,address,number,neighborhood,complement,city,state')
          .eq('company_id', companyId)
          .order('name', { ascending: true })
          .limit(500);
        if (digits.length >= 3) {
          // busca por dígitos (telefone OU cpf) — server-side é seguro
          req = req.or(
            `phone.ilike.%${digits}%,cpf.ilike.%${digits}%`,
          );
        }
        const { data, error } = await req;
        if (error) throw error;
        let rows = (data as CustomerRow[]) || [];
        // Filtro por nome ignorando acentuação (server ilike não é
        // accent-insensitive). Normaliza com NFD + remove diacríticos.
        if (digits.length < 3) {
          const norm = (s: string) =>
            (s || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase();
          const nq = norm(q);
          rows = rows.filter((r) => norm(r.name || '').includes(nq));
        }
        setResults(rows.slice(0, 20));
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
        !selected.address?.trim() && 'rua',
        !selected.number?.trim() && 'número',
        !selected.neighborhood?.trim() && 'bairro',
      ].filter(Boolean) as string[]
    : [];

  function handleConfirmSelected() {
    if (!selected) return;
    if (selectedMissing.length > 0) {
      toast.error(`Cadastro incompleto: falta ${selectedMissing.join(', ')}. Clique em "Completar cadastro" para editar aqui mesmo.`);
      return;
    }
    const fullAddr = [
      selected.address,
      selected.number && `nº ${selected.number}`,
      selected.neighborhood,
      selected.complement,
    ].filter(Boolean).join(', ');
    onPick({
      name: selected.name || undefined,
      phone: selected.phone || undefined,
      document: selected.cpf || undefined,
      address: fullAddr || selected.address || undefined,
      city: selected.city || undefined,
      state: selected.state || undefined,
    });
    onOpenChange(false);
  }

  /** Abre o formulário no modo edição, pré-preenchido com o cliente selecionado. */
  function handleEditSelected() {
    if (!selected) return;
    // Extrai "Ref: ..." do complement, se armazenado nesse formato pela FC.
    const rawComp = selected.complement || '';
    let complement = rawComp;
    let reference = '';
    const m = rawComp.match(/^(.*?)(?:\s*[-|]\s*)?Ref:\s*(.+)$/i);
    if (m) {
      complement = (m[1] || '').trim();
      reference = (m[2] || '').trim();
    }
    setForm({
      name: selected.name || '',
      phone: maskPhoneBR(selected.phone || ''),
      cpf: maskCpfCnpj(selected.cpf || ''),
      address: selected.address || '',
      number: selected.number || '',
      neighborhood: selected.neighborhood || '',
      complement,
      reference,
      city: selected.city || '',
      state: selected.state || '',
    });
    setEditingId(selected.id);
    setMode('create');
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
    const number = form.number.trim();
    const neighborhood = form.neighborhood.trim();
    const complement = form.complement.trim();
    const reference = form.reference.trim();
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
    if (!isValidBrPhone(phone)) {
      toast.error('Telefone inválido. Use um número brasileiro válido — fixo (10 dígitos) ou celular (11 dígitos com 9).');
      return;
    }
    if (cpf) {
      const cd = onlyDigits(cpf);
      if (cd.length !== 11 && cd.length !== 14) {
        toast.error('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.');
        return;
      }
    }
    if (requireFull) {
      if (!cpf) {
        toast.error('CPF é obrigatório para venda no crediário.');
        return;
      }
      if (!address) {
        toast.error('Rua/logradouro é obrigatório para venda no crediário.');
        return;
      }
      if (!number) {
        toast.error('Número do endereço é obrigatório para venda no crediário.');
        return;
      }
      if (!neighborhood) {
        toast.error('Bairro é obrigatório para venda no crediário.');
        return;
      }
    }
    setSaving(true);
    try {
      // Ponto de referência: opcional no FC. Persistimos concatenado em `complement`
      // no formato "<complement> - Ref: <reference>" (mesma convenção do cardápio).
      const mergedComplement = [complement, reference && `Ref: ${reference}`]
        .filter(Boolean)
        .join(complement && reference ? ' - ' : '');
      const payload = {
        company_id: companyId,
        name,
        phone,
        cpf: cpf || null,
        address: address || null,
        number: number || null,
        neighborhood: neighborhood || null,
        complement: mergedComplement || null,
        city: city || null,
        state: state || null,
      };
      let data: any;
      if (editingId) {
        const { data: upd, error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingId)
          .select('id,name,phone,cpf,address,number,neighborhood,complement,city,state')
          .single();
        if (error) throw error;
        data = upd;
        toast.success('Cadastro atualizado.');
      } else {
        const { data: ins, error } = await supabase
          .from('customers')
          .insert(payload)
          .select('id,name,phone,cpf,address,number,neighborhood,complement,city,state')
          .single();
        if (error) throw error;
        data = ins;
        toast.success('Cliente cadastrado.');
      }
      const fullAddr = [
        address,
        number && `nº ${number}`,
        neighborhood,
        mergedComplement,
      ].filter(Boolean).join(', ');
      onPick({
        name: data?.name || name,
        phone: data?.phone || phone,
        document: data?.cpf || cpf || undefined,
        address: fullAddr || data?.address || address || undefined,
        city: data?.city || city || undefined,
        state: data?.state || state || undefined,
      });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[FrenteCaixaCustomerDialog] create error', e);
      const msg = String(e?.message || '');
      if (msg.includes('Já existe um cliente cadastrado com este CPF')) {
        toast.error(msg + '. Busque pelo CPF acima e use "Completar cadastro" para editar o cliente existente.');
      } else {
        toast.error(msg || 'Erro ao cadastrar cliente.');
      }
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
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <p className="text-xs text-destructive">
                  Cadastro incompleto — falta {selectedMissing.join(', ')}.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleEditSelected}
                  className="h-7 text-xs"
                >
                  Completar cadastro
                </Button>
              </div>
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
                onClick={() => { setMode('search'); setEditingId(null); }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold">
                {editingId ? 'Completar cadastro do cliente' : 'Novo cliente'}
              </h2>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Rua / Logradouro {requireFull ? '*' : ''}</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Número {requireFull ? '*' : ''}</Label>
                  <Input
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Bairro {requireFull ? '*' : ''}</Label>
                  <Input
                    value={form.neighborhood}
                    onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Complemento</Label>
                  <Input
                    value={form.complement}
                    onChange={(e) => setForm({ ...form, complement: e.target.value })}
                    disabled={saving}
                    placeholder="apto, bloco, referência"
                  />
                </div>
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
                  editingId ? 'ATUALIZAR E USAR' : 'SALVAR E USAR'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
