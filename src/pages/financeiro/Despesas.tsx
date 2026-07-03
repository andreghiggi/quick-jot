import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsPayable, type AccountPayable } from '@/hooks/useAccountsPayable';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';
import {
  FinanceSearchBar, FinanceFilterPanel, FinanceCard, FinanceActionMenu, FinanceDetailModal,
  FloatingFab, RenegotiateDialog, ConfirmDialog, BulkActionBar, Pagination,
  computeUIStatus, applyFilters, emptyFilters,
  type FinanceRow, type FinanceFilters,
} from '@/components/financeiro/finance-shared';
import { FinanceModuleLayout } from '@/components/financeiro/FinanceModuleLayout';
import { NewFinanceEntryDialog } from '@/components/financeiro/NewFinanceEntryDialog';

const PAYMENT_METHODS = ['Dinheiro', 'PIX', 'Transferência', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto', 'Outro'];
const CATEGORIES = ['Fornecedor', 'Aluguel', 'Energia', 'Água', 'Internet', 'Salários', 'Impostos', 'Manutenção', 'Marketing', 'Outros'];

interface SupplierOption { id: string; name: string }

export default function Despesas() {
  const { user, company } = useAuthContext();
  const { enabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const { items, loading, reload, create, pay, remove, update, renegotiate } = useAccountsPayable(company?.id);

  const today = new Date().toISOString().slice(0, 10);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  useEffect(() => {
    if (!company?.id) return;
    (supabase.from('suppliers') as any)
      .select('id, name').eq('company_id', company.id).eq('active', true).order('name')
      .then(({ data }: any) => setSuppliers((data as any[]) ?? []));
  }, [company?.id]);

  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FinanceFilters>(emptyFilters);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuTarget, setMenuTarget] = useState<FinanceRow | null>(null);
  const [detail, setDetail] = useState<FinanceRow | null>(null);
  const [editRow, setEditRow] = useState<AccountPayable | null>(null);
  const [payRow, setPayRow] = useState<AccountPayable | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('Dinheiro');
  const [renegRow, setRenegRow] = useState<AccountPayable | null>(null);
  const [deleteRow, setDeleteRow] = useState<AccountPayable | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<FinanceRow[]>(() => items.map((p) => ({
    id: p.id,
    document_number: p.document_number,
    party_name: suppliers.find((s) => s.id === p.supplier_id)?.name || p.description,
    amount: Number(p.amount),
    balance: Number(p.balance),
    interest_amount: Number(p.interest_amount ?? 0),
    fine_amount: Number(p.fine_amount ?? 0),
    issue_date: p.issue_date,
    due_date: p.due_date,
    status: computeUIStatus(p.status, p.due_date, today),
    description: p.description,
    origin_type: p.origin_type,
    origin_id: p.origin_id,
    tags: p.tags || [],
  })), [items, today, suppliers]);

  const filtered = useMemo(() => {
    const list = applyFilters(rows, filters, search);
    return [...list].sort((a, b) => sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date));
  }, [rows, filters, search, sortAsc]);

  const paged = filtered.slice((page - 1) * size, page * size);
  const selectionMode = selection.size > 0;

  if (finLoading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!enabled) return <Navigate to="/" replace />;

  const findAP = (id: string) => items.find((i) => i.id === id) || null;

  const openPay = (id: string) => {
    const r = findAP(id); if (!r) return;
    setPayRow(r);
    setPayAmt(maskCurrencyInput(Number(r.balance).toFixed(2).replace('.', ',')));
    setPayMethod('Dinheiro');
  };

  const submitPay = async () => {
    if (!payRow || !company?.id) return;
    const amt = parseCurrencyInput(payAmt);
    if (amt <= 0) return;
    setBusy(true);
    const ok = await pay({
      payableId: payRow.id, companyId: company.id, amount: amt,
      paymentMethod: payMethod, createdBy: user?.id ?? null,
    });
    setBusy(false);
    if (ok) setPayRow(null);
  };

  const submitCreate = async (p: import('@/components/financeiro/NewFinanceEntryDialog').NewFinancePayload) => {
    if (!company?.id) return false;
    setBusy(true);
    const n = Math.max(1, p.installments);
    const each = Math.round((p.amount / n) * 100) / 100;
    let ok = 0;
    const base = new Date(p.dueDate + 'T00:00:00');
    for (let i = 0; i < n; i++) {
      const due = new Date(base);
      due.setDate(base.getDate() + i * p.installmentIntervalDays);
      const dueStr = due.toISOString().slice(0, 10);
      const amt = i === n - 1 ? +(p.amount - each * (n - 1)).toFixed(2) : each;
      const suffix = n > 1 ? ` (${i + 1}/${n})` : '';
      const desc = (p.description || p.partyName || 'Despesa') + suffix;
      const id = await create({
        companyId: company.id, description: desc, amount: amt,
        dueDate: dueStr, issueDate: p.issueDate,
        documentNumber: p.documentNumber ? `${p.documentNumber}${suffix}` : null,
        notes: p.description || null, createdBy: user?.id ?? null,
      });
      if (id) {
        ok++;
        if (p.alreadyPaid) {
          await pay({ payableId: id, companyId: company.id, amount: amt, paymentMethod: 'Dinheiro', createdBy: user?.id ?? null });
        }
      }
    }
    setBusy(false);
    return ok === n;
  };

  const submitEdit = async () => {
    if (!editRow) return;
    setBusy(true);
    const ok = await update(editRow.id, {
      description: editRow.description,
      category: editRow.category,
      due_date: editRow.due_date,
      notes: editRow.notes,
    });
    setBusy(false);
    if (ok) setEditRow(null);
  };

  const bulkPay = async () => {
    if (!company?.id) return;
    setBusy(true);
    for (const id of selection) {
      const r = findAP(id);
      if (r && (r.status === 'open' || r.status === 'partial')) {
        await pay({ payableId: id, companyId: company.id, amount: Number(r.balance), paymentMethod: 'Dinheiro', createdBy: user?.id ?? null });
      }
    }
    setBusy(false);
    setSelection(new Set());
  };

  const doBulkDelete = async () => {
    setBusy(true);
    for (const id of selection) await remove(id);
    setBusy(false);
    setSelection(new Set());
    setBulkDelete(false);
  };

  return (
    <FinanceModuleLayout kind="despesas" title="Despesas">
      <BulkActionBar
        count={selection.size}
        onClear={() => setSelection(new Set())}
        onBulkPay={bulkPay}
        onBulkDelete={() => setBulkDelete(true)}
        quitarLabel="Pagar selecionados"
      />

      <FinanceSearchBar
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        onToggleFilter={() => setFiltersOpen((o) => !o)}
        onToggleSort={() => setSortAsc((s) => !s)}
        onRefresh={reload}
        sortLabel={sortAsc ? 'Vencimento crescente' : 'Vencimento decrescente'}
      />

      <FinanceFilterPanel
        open={filtersOpen} filters={filters} setFilters={setFilters}
        partyLabel="Fornecedor / Descrição"
        onApply={() => { setPage(1); setFiltersOpen(false); }}
        onClear={() => { setFilters(emptyFilters); setPage(1); }}
      />

      <Card className="bg-muted/30">
        <CardContent className="p-0">
          <Pagination page={page} size={size} total={filtered.length} setPage={setPage} setSize={setSize} />
          <div className="border-t border-border" />
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : paged.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum título encontrado.</div>
          ) : (
            <div className="space-y-1 p-2">
              {paged.map((r) => (
                <FinanceCard
                  key={r.id}
                  row={r}
                  selected={selection.has(r.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={() => {
                    const s = new Set(selection);
                    s.has(r.id) ? s.delete(r.id) : s.add(r.id);
                    setSelection(s);
                  }}
                  onOpenMenu={(el) => { setMenuAnchor(el); setMenuTarget(r); }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FinanceActionMenu
        open={!!menuTarget}
        anchorRef={menuAnchor}
        onClose={() => { setMenuTarget(null); setMenuAnchor(null); }}
        canQuitar={menuTarget?.status === 'a_vencer' || menuTarget?.status === 'vencida' || menuTarget?.status === 'parcial'}
        onSelectMark={() => menuTarget && setSelection(new Set(selection).add(menuTarget.id))}
        onDetails={() => menuTarget && setDetail(menuTarget)}
        onEdit={() => menuTarget && setEditRow(findAP(menuTarget.id))}
        onQuitar={() => menuTarget && openPay(menuTarget.id)}
        onRenegotiate={() => menuTarget && setRenegRow(findAP(menuTarget.id))}
        onDelete={() => menuTarget && setDeleteRow(findAP(menuTarget.id))}
        quitarLabel="Pagar"
      />

      <FinanceDetailModal
        row={detail}
        open={!!detail}
        onClose={() => setDetail(null)}
        onEdit={() => { if (detail) { setEditRow(findAP(detail.id)); setDetail(null); } }}
        originLabel={detail?.origin_type ?? undefined}
      />

      {/* Pagar */}
      <Dialog open={!!payRow} onOpenChange={(o) => !o && !busy && setPayRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar título</DialogTitle>
            <DialogDescription>{payRow && `${payRow.description} — saldo ${brl(Number(payRow.balance))}`}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Valor pago</Label>
              <Input value={payAmt} onChange={(e) => setPayAmt(maskCurrencyInput(e.target.value))} inputMode="decimal" />
            </div>
            <div className="grid gap-1.5"><Label>Forma de pagamento</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayRow(null)} disabled={busy}>Voltar</Button>
            <Button onClick={submitPay} disabled={busy}><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && !busy && setEditRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar título</DialogTitle></DialogHeader>
          {editRow && (
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Descrição</Label>
                <Input value={editRow.description} onChange={(e) => setEditRow({ ...editRow, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Categoria</Label>
                  <Select value={editRow.category || 'Outros'} onValueChange={(v) => setEditRow({ ...editRow, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5"><Label>Vencimento</Label>
                  <Input type="date" value={editRow.due_date} onChange={(e) => setEditRow({ ...editRow, due_date: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5"><Label>Observações</Label>
                <Textarea value={editRow.notes || ''} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRow(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={busy}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewFinanceEntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        kind="despesa"
        busy={busy}
        onSubmit={submitCreate}
      />

      <RenegotiateDialog
        open={!!renegRow}
        onOpenChange={(o) => !o && setRenegRow(null)}
        current={renegRow ? {
          id: renegRow.id, document_number: renegRow.document_number, party_name: renegRow.description,
          amount: Number(renegRow.amount), balance: Number(renegRow.balance),
          interest_amount: 0, fine_amount: 0,
          issue_date: renegRow.issue_date, due_date: renegRow.due_date,
          status: computeUIStatus(renegRow.status, renegRow.due_date, today),
          description: renegRow.description, origin_type: renegRow.origin_type, origin_id: renegRow.origin_id, tags: [],
        } : null}
        busy={busy}
        onConfirm={async (na, nd, reason) => {
          if (!renegRow || !company?.id) return;
          setBusy(true);
          const ok = await renegotiate(renegRow.id, na, nd, reason, company.id, user?.id);
          setBusy(false);
          if (ok) setRenegRow(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}
        title="Excluir título" destructive
        description={deleteRow ? `Excluir "${deleteRow.description}" (${brl(Number(deleteRow.balance))})?` : ''}
        busy={busy}
        onConfirm={async () => {
          if (!deleteRow) return;
          setBusy(true);
          const ok = await remove(deleteRow.id);
          setBusy(false);
          if (ok) setDeleteRow(null);
        }}
      />

      <ConfirmDialog
        open={bulkDelete} onOpenChange={setBulkDelete}
        title="Excluir selecionados" destructive
        description={`Excluir ${selection.size} título(s)?`}
        busy={busy}
        onConfirm={doBulkDelete}
      />

      <FloatingFab onClick={() => setCreateOpen(true)} label="Nova despesa" />
    </FinanceModuleLayout>
  );
}