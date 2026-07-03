import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsReceivable, type AccountReceivable } from '@/hooks/useAccountsReceivable';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';
import {
  FinanceSearchBar, FinanceFilterPanel, FinanceCard, FinanceActionMenu, FinanceDetailModal,
  FloatingFab, RenegotiateDialog, ConfirmDialog, BulkActionBar, Pagination,
  computeUIStatus, applyFilters, emptyFilters,
  type FinanceRow, type FinanceFilters,
} from '@/components/financeiro/finance-shared';
import { FinanceModuleLayout } from '@/components/financeiro/FinanceModuleLayout';

export default function Receitas() {
  const { user, company } = useAuthContext();
  const { enabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const {
    items, loading, reload, create, receivePayment, cancel, remove, update, renegotiate,
  } = useAccountsReceivable(company?.id);
  const { activePaymentMethods } = usePaymentMethods({ companyId: company?.id, channel: 'pdv' });

  const today = new Date().toISOString().slice(0, 10);

  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FinanceFilters>(emptyFilters);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  // dialogs
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuTarget, setMenuTarget] = useState<FinanceRow | null>(null);
  const [detail, setDetail] = useState<FinanceRow | null>(null);
  const [editRow, setEditRow] = useState<AccountReceivable | null>(null);
  const [receiveRow, setReceiveRow] = useState<AccountReceivable | null>(null);
  const [receiveAmt, setReceiveAmt] = useState('');
  const [receiveMethod, setReceiveMethod] = useState('');
  const [renegRow, setRenegRow] = useState<AccountReceivable | null>(null);
  const [deleteRow, setDeleteRow] = useState<AccountReceivable | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // create form
  const [nName, setNName] = useState('');
  const [nPhone, setNPhone] = useState('');
  const [nAmt, setNAmt] = useState('');
  const [nDue, setNDue] = useState(today);
  const [nNotes, setNNotes] = useState('');

  const rows = useMemo<FinanceRow[]>(() => items.map((r) => ({
    id: r.id,
    document_number: r.document_number,
    party_name: r.customer_name,
    amount: Number(r.amount),
    balance: Number(r.balance),
    interest_amount: Number(r.interest_amount ?? 0),
    fine_amount: Number(r.fine_amount ?? 0),
    issue_date: r.issue_date,
    due_date: r.due_date,
    status: computeUIStatus(r.status, r.due_date, today),
    description: r.notes || '',
    origin_type: r.origin_type,
    origin_id: r.origin_id,
    tags: r.tags || [],
  })), [items, today]);

  const filtered = useMemo(() => {
    const list = applyFilters(rows, filters, search);
    return [...list].sort((a, b) => sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date));
  }, [rows, filters, search, sortAsc]);

  const paged = filtered.slice((page - 1) * size, page * size);
  const selectionMode = selection.size > 0;

  if (finLoading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!enabled) return <Navigate to="/" replace />;

  const findAR = (id: string) => items.find((i) => i.id === id) || null;

  const openReceive = (id: string) => {
    const r = findAR(id); if (!r) return;
    setReceiveRow(r);
    setReceiveAmt(maskCurrencyInput(Number(r.balance).toFixed(2).replace('.', ',')));
    setReceiveMethod('');
  };

  const submitReceive = async () => {
    if (!receiveRow || !company?.id) return;
    const amt = parseCurrencyInput(receiveAmt);
    if (amt <= 0) return;
    const sel = activePaymentMethods.find((m) => m.id === receiveMethod);
    setBusy(true);
    const ok = await receivePayment({
      receivableId: receiveRow.id, companyId: company.id, amount: amt,
      paymentMethodId: sel?.id ?? null, paymentName: sel?.name || 'Dinheiro',
      operatorId: user?.id ?? null,
    });
    setBusy(false);
    if (ok) setReceiveRow(null);
  };

  const submitCreate = async () => {
    if (!company?.id) return;
    const amt = parseCurrencyInput(nAmt);
    if (!nName.trim() || amt <= 0 || !nDue) return;
    setBusy(true);
    const id = await create({
      companyId: company.id, customerName: nName.trim(), customerPhone: nPhone || null,
      amount: amt, dueDate: nDue, notes: nNotes || null, createdBy: user?.id ?? null,
    });
    setBusy(false);
    if (id) {
      setCreateOpen(false);
      setNName(''); setNPhone(''); setNAmt(''); setNDue(today); setNNotes('');
    }
  };

  const submitEdit = async () => {
    if (!editRow) return;
    setBusy(true);
    const ok = await update(editRow.id, {
      customer_name: editRow.customer_name,
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
      const r = findAR(id);
      if (r && r.status === 'open') {
        await receivePayment({
          receivableId: id, companyId: company.id, amount: Number(r.balance),
          paymentMethodId: null, paymentName: 'Dinheiro', operatorId: user?.id ?? null,
        });
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
    <FinanceModuleLayout kind="receitas" title="Receitas">
      <BulkActionBar
        count={selection.size}
        onClear={() => setSelection(new Set())}
        onBulkPay={bulkPay}
        onBulkDelete={() => setBulkDelete(true)}
        quitarLabel="Receber selecionados"
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
        partyLabel="Cliente"
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
        onEdit={() => menuTarget && setEditRow(findAR(menuTarget.id))}
        onQuitar={() => menuTarget && openReceive(menuTarget.id)}
        onRenegotiate={() => menuTarget && setRenegRow(findAR(menuTarget.id))}
        onDelete={() => menuTarget && setDeleteRow(findAR(menuTarget.id))}
        quitarLabel="Receber"
      />

      <FinanceDetailModal
        row={detail}
        open={!!detail}
        onClose={() => setDetail(null)}
        onEdit={() => { if (detail) { setEditRow(findAR(detail.id)); setDetail(null); } }}
        originLabel={detail?.origin_type === 'pre_venda' ? 'Pré-venda' : detail?.origin_type === 'pdv' ? 'PDV' : detail?.origin_type === 'manual' ? 'Manual' : undefined}
      />

      {/* Receber */}
      <Dialog open={!!receiveRow} onOpenChange={(o) => !o && !busy && setReceiveRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber título</DialogTitle>
            <DialogDescription>
              {receiveRow && `${receiveRow.customer_name} — saldo ${brl(Number(receiveRow.balance))}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Valor recebido</Label>
              <Input value={receiveAmt} onChange={(e) => setReceiveAmt(maskCurrencyInput(e.target.value))} inputMode="decimal" />
            </div>
            <div className="grid gap-1.5"><Label>Forma de recebimento</Label>
              <Select value={receiveMethod} onValueChange={setReceiveMethod}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activePaymentMethods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiveRow(null)} disabled={busy}>Voltar</Button>
            <Button onClick={submitReceive} disabled={busy || !receiveMethod}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && !busy && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar título</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Cliente</Label>
                <Input value={editRow.customer_name} onChange={(e) => setEditRow({ ...editRow, customer_name: e.target.value })} />
              </div>
              <div className="grid gap-1.5"><Label>Vencimento</Label>
                <Input type="date" value={editRow.due_date} onChange={(e) => setEditRow({ ...editRow, due_date: e.target.value })} />
              </div>
              <div className="grid gap-1.5"><Label>Descrição</Label>
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

      {/* Criar */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && !busy && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova receita</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Cliente</Label>
              <Input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Telefone</Label>
                <Input value={nPhone} onChange={(e) => setNPhone(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="grid gap-1.5"><Label>Valor</Label>
                <Input value={nAmt} onChange={(e) => setNAmt(maskCurrencyInput(e.target.value))} inputMode="decimal" placeholder="R$ 0,00" />
              </div>
            </div>
            <div className="grid gap-1.5"><Label>Vencimento</Label>
              <Input type="date" value={nDue} onChange={(e) => setNDue(e.target.value)} />
            </div>
            <div className="grid gap-1.5"><Label>Descrição</Label>
              <Textarea value={nNotes} onChange={(e) => setNNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={submitCreate} disabled={busy || !nName.trim() || parseCurrencyInput(nAmt) <= 0}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RenegotiateDialog
        open={!!renegRow}
        onOpenChange={(o) => !o && setRenegRow(null)}
        current={renegRow ? {
          id: renegRow.id, document_number: renegRow.document_number, party_name: renegRow.customer_name,
          amount: Number(renegRow.amount), balance: Number(renegRow.balance),
          interest_amount: 0, fine_amount: 0,
          issue_date: renegRow.issue_date, due_date: renegRow.due_date,
          status: computeUIStatus(renegRow.status, renegRow.due_date, today),
          description: renegRow.notes || '', origin_type: renegRow.origin_type, origin_id: renegRow.origin_id, tags: [],
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
        description={deleteRow ? `Excluir o título de ${deleteRow.customer_name} (${brl(Number(deleteRow.balance))})?` : ''}
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
        description={`Excluir ${selection.size} título(s)? Essa ação não pode ser desfeita.`}
        busy={busy}
        onConfirm={doBulkDelete}
      />

      <FloatingFab onClick={() => setCreateOpen(true)} label="Nova receita" />
    </FinanceModuleLayout>
  );
}