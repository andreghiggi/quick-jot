import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Check, MoreVertical, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsReceivable, type AccountReceivable } from '@/hooks/useAccountsReceivable';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { brl } from '@/components/pdv-v2/_format';
import {
  FinanceSearchBar, FinanceFilterPanel, FinanceActionMenu,
  FloatingFab, ConfirmDialog, BulkActionBar, Pagination, StatusBadge,
  computeUIStatus, applyFilters, emptyFilters,
  type FinanceRow, type FinanceFilters,
} from '@/components/financeiro/finance-shared';
import { FinanceModuleLayout } from '@/components/financeiro/FinanceModuleLayout';
import { NewFinanceEntryDialog } from '@/components/financeiro/NewFinanceEntryDialog';
import { EfetivarReceitaDialog } from '@/components/financeiro/EfetivarReceitaDialog';
import { RenegociarReceitaDialog } from '@/components/financeiro/RenegociarReceitaDialog';
import { cn } from '@/lib/utils';

/** Item agregado da lista: pode ser uma venda com N parcelas OU um
 *  título avulso (sem pdv_sale_id). */
type GroupItem =
  | { kind: 'sale'; key: string; saleId: string; parcelas: AccountReceivable[] }
  | { kind: 'single'; key: string; row: AccountReceivable };

export default function Receitas() {
  const { user, company } = useAuthContext();
  const { enabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const {
    items, loading, reload, create, receivePayment, receivePaymentSplit,
    remove, update, renegotiateSplit,
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
  const [editRow, setEditRow] = useState<AccountReceivable | null>(null);
  const [deleteRow, setDeleteRow] = useState<AccountReceivable | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nova UX — agrupamento por venda
  const [installmentsGroup, setInstallmentsGroup] = useState<GroupItem | null>(null);
  const [detailsGroup, setDetailsGroup] = useState<GroupItem | null>(null);
  const [efetivarRow, setEfetivarRow] = useState<AccountReceivable | null>(null);
  const [renegRow, setRenegRow] = useState<AccountReceivable | null>(null);
  /** Ação pendente ao selecionar uma parcela dentro do diálogo "Parcelas". */
  const [pendingAction, setPendingAction] = useState<'receber' | 'renegociar' | null>(null);

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
    pdv_sale_id: r.pdv_sale_id,
  })), [items, today]);

  const filtered = useMemo(() => {
    const list = applyFilters(rows, filters, search);
    return [...list].sort((a, b) => sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date));
  }, [rows, filters, search, sortAsc]);

  /** Agrupamento por pdv_sale_id: parcelas da mesma venda viram 1 item. */
  const groups = useMemo<GroupItem[]>(() => {
    const bySale = new Map<string, AccountReceivable[]>();
    const singles: GroupItem[] = [];
    const visibleIds = new Set(filtered.map((r) => r.id));
    for (const it of items) {
      if (!visibleIds.has(it.id)) continue;
      if (it.pdv_sale_id) {
        const arr = bySale.get(it.pdv_sale_id) || [];
        arr.push(it);
        bySale.set(it.pdv_sale_id, arr);
      } else {
        singles.push({ kind: 'single', key: it.id, row: it });
      }
    }
    const salesGroups: GroupItem[] = Array.from(bySale.entries()).map(([saleId, parcelas]) => ({
      kind: 'sale' as const,
      key: `sale:${saleId}`,
      saleId,
      parcelas: parcelas.sort((a, b) => a.due_date.localeCompare(b.due_date)),
    }));
    const all = [...salesGroups, ...singles];
    // Ordena pela menor data de vencimento do grupo
    all.sort((a, b) => {
      const da = a.kind === 'sale' ? a.parcelas[0].due_date : a.row.due_date;
      const db = b.kind === 'sale' ? b.parcelas[0].due_date : b.row.due_date;
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
    return all;
  }, [items, filtered, sortAsc]);

  const paged = groups.slice((page - 1) * size, page * size);
  const selectionMode = selection.size > 0;

  if (finLoading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!enabled) return <Navigate to="/" replace />;

  const findAR = (id: string) => items.find((i) => i.id === id) || null;

  const openEfetivar = (id: string) => { const r = findAR(id); if (r) setEfetivarRow(r); };
  const openRenegociar = (id: string) => { const r = findAR(id); if (r) setRenegRow(r); };

  /** Escolhe automaticamente a próxima parcela em aberto de uma venda. */
  const firstOpenOf = (g: GroupItem): AccountReceivable | null => {
    if (g.kind === 'single') return g.row.status === 'open' ? g.row : null;
    return g.parcelas.find((p) => p.status === 'open') || null;
  };

  const handleGroupAction = (g: GroupItem, action: 'receber' | 'renegociar') => {
    if (g.kind === 'single') {
      if (g.row.status !== 'open') return;
      action === 'receber' ? openEfetivar(g.row.id) : openRenegociar(g.row.id);
      return;
    }
    const openCount = g.parcelas.filter((p) => p.status === 'open').length;
    if (openCount === 1) {
      const p = firstOpenOf(g);
      if (p) (action === 'receber' ? openEfetivar : openRenegociar)(p.id);
      return;
    }
    // Várias parcelas em aberto: abre o seletor.
    setPendingAction(action);
    setInstallmentsGroup(g);
  };

  const submitCreate = async (p: import('@/components/financeiro/NewFinanceEntryDialog').NewFinancePayload) => {
    if (!company?.id) return false;
    setBusy(true);
    const n = Math.max(1, p.installments);
    const each = Math.round((p.amount / n) * 100) / 100;
    let createdOk = 0;
    const base = new Date(p.dueDate + 'T00:00:00');
    for (let i = 0; i < n; i++) {
      const due = new Date(base);
      due.setDate(base.getDate() + i * p.installmentIntervalDays);
      const dueStr = due.toISOString().slice(0, 10);
      const amt = i === n - 1 ? +(p.amount - each * (n - 1)).toFixed(2) : each;
      const suffix = n > 1 ? ` (${i + 1}/${n})` : '';
      const id = await create({
        companyId: company.id,
        customerName: p.partyName || 'Sem cliente',
        amount: amt,
        dueDate: dueStr,
        issueDate: p.issueDate,
        documentNumber: p.documentNumber ? `${p.documentNumber}${suffix}` : null,
        notes: p.description || null,
        createdBy: user?.id ?? null,
      });
      if (id) {
        createdOk++;
        if (p.alreadyPaid) {
          await receivePayment({
            receivableId: id, companyId: company.id, amount: amt,
            paymentMethodId: null, paymentName: 'Dinheiro',
            operatorId: user?.id ?? null,
          });
        }
      }
    }
    setBusy(false);
    return createdOk === n;
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
          <Pagination page={page} size={size} total={groups.length} setPage={setPage} setSize={setSize} />
          <div className="border-t border-border" />
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : paged.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma venda encontrada.</div>
          ) : (
            <div className="space-y-1 p-2">
              {paged.map((g) => (
                <SaleGroupCard
                  key={g.key}
                  group={g}
                  today={today}
                  onDoubleClick={() => setInstallmentsGroup(g)}
                  onOpenMenu={(el, row) => { setMenuAnchor(el); setMenuTarget(row); }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parcelas da venda — abre com duplo clique OU quando uma ação
          (Receber/Renegociar) precisa que o operador escolha a parcela. */}
      <Dialog open={!!installmentsGroup} onOpenChange={(o) => { if (!o) { setInstallmentsGroup(null); setPendingAction(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Parcelas da venda</DialogTitle>
            <DialogDescription>
              {pendingAction === 'renegociar'
                ? 'Selecione a parcela que deseja renegociar.'
                : pendingAction === 'receber'
                ? 'Selecione a parcela que deseja receber.'
                : 'Visão geral das parcelas dessa venda.'}
            </DialogDescription>
          </DialogHeader>
          {installmentsGroup && (() => {
            const siblings = installmentsGroup.kind === 'sale'
              ? installmentsGroup.parcelas
              : [installmentsGroup.row];
            if (siblings.length === 0) {
              return <div className="text-sm text-muted-foreground py-4">Nenhuma parcela encontrada.</div>;
            }
            const totalAmount = siblings.reduce((s, i) => s + Number(i.amount), 0);
            const totalBalance = siblings.reduce((s, i) => s + Number(i.balance), 0);
            return (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>Cliente: <b>{siblings[0].customer_name}</b></span>
                  <span>Total: {brl(totalAmount)} · Saldo: {brl(totalBalance)}</span>
                </div>
                <div className="divide-y rounded-md border">
                  {siblings.map((it, idx) => {
                    const uiStatus = computeUIStatus(it.status, it.due_date, today);
                    const isOpen = it.status === 'open';
                    return (
                      <div key={it.id} className="flex items-center gap-3 p-3">
                        <div className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}/{String(siblings.length).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            Vence {it.due_date.split('-').reverse().join('/')}
                            <span className="text-muted-foreground"> · </span>
                            <span className="text-emerald-500">{brl(Number(it.amount))}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            Saldo: {brl(Number(it.balance))}
                            {it.document_number ? ` · ${it.document_number}` : ''}
                          </div>
                        </div>
                        <StatusBadge status={uiStatus} />
                        {pendingAction === 'renegociar' ? (
                          <Button size="sm" disabled={!isOpen}
                            onClick={() => { setInstallmentsGroup(null); setPendingAction(null); openRenegociar(it.id); }}>
                            Renegociar
                          </Button>
                        ) : (
                          <Button size="sm" disabled={!isOpen}
                            onClick={() => { setInstallmentsGroup(null); setPendingAction(null); openEfetivar(it.id); }}>
                            <Check className="h-4 w-4 mr-1" /> Receber
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setInstallmentsGroup(null); setPendingAction(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FinanceActionMenu
        open={!!menuTarget}
        anchorRef={menuAnchor}
        onClose={() => { setMenuTarget(null); setMenuAnchor(null); }}
        canQuitar={!!menuTarget && menuTarget.status !== 'paga' && menuTarget.status !== 'cancelada'}
        onSelectMark={() => menuTarget && setSelection(new Set(selection).add(menuTarget.id))}
        onDetails={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          if (g) setDetailsGroup(g);
        }}
        onEdit={() => menuTarget && setEditRow(findAR(menuTarget.id))}
        onQuitar={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          if (g) handleGroupAction(g, 'receber');
        }}
        onRenegotiate={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          if (g) handleGroupAction(g, 'renegociar');
        }}
        onDelete={() => menuTarget && setDeleteRow(findAR(menuTarget.id))}
        quitarLabel="Receber"
      />

      {/* Detalhes da venda */}
      <DetalhesVendaDialog
        group={detailsGroup}
        onClose={() => setDetailsGroup(null)}
        today={today}
      />

      {/* Novo diálogo — Efetivar receita (estilo Gweb) */}
      <EfetivarReceitaDialog
        open={!!efetivarRow}
        onOpenChange={(o) => !o && setEfetivarRow(null)}
        receivable={efetivarRow}
        paymentMethods={activePaymentMethods.map((m) => ({ id: m.id, name: m.name }))}
        busy={busy}
        onConfirm={async (data) => {
          if (!efetivarRow || !company?.id) return;
          setBusy(true);
          const ok = await receivePaymentSplit({
            receivableId: efetivarRow.id,
            companyId: company.id,
            operatorId: user?.id ?? null,
            interest: data.interest, fine: data.fine, discount: data.discount, surcharge: data.surcharge,
            payments: data.payments,
          });
          setBusy(false);
          if (ok) setEfetivarRow(null);
        }}
      />

      {/* Novo diálogo — Renegociação */}
      <RenegociarReceitaDialog
        open={!!renegRow}
        onOpenChange={(o) => !o && setRenegRow(null)}
        receivable={renegRow}
        busy={busy}
        onConfirm={async (data) => {
          if (!renegRow || !company?.id) return;
          setBusy(true);
          const ok = await renegotiateSplit({
            receivableId: renegRow.id,
            companyId: company.id,
            userId: user?.id ?? null,
            newTotalAmount: data.newTotalAmount,
            installments: data.installments,
          });
          setBusy(false);
          if (ok) setRenegRow(null);
        }}
      />

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

      <NewFinanceEntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        kind="receita"
        busy={busy}
        onSubmit={submitCreate}
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

/* ─────────────────────────────────────────────────────────
 *  Card agregado por venda + Dialog "Detalhes da venda"
 *  Definidos inline por serem específicos desta página.
 * ───────────────────────────────────────────────────────── */

function groupStatus(g: GroupItem, today: string) {
  const rows = g.kind === 'sale' ? g.parcelas : [g.row];
  const opens = rows.filter((r) => r.status === 'open');
  if (opens.length === 0) return computeUIStatus('paid', today, today);
  const hasVencida = opens.some((r) => r.due_date < today);
  const hasParcial = rows.some((r) => Number(r.balance) < Number(r.amount) && r.status === 'open');
  if (hasVencida) return 'vencida' as const;
  if (hasParcial) return 'parcial' as const;
  return 'a_vencer' as const;
}

function SaleGroupCard({
  group, today, onDoubleClick, onOpenMenu,
}: {
  group: GroupItem;
  today: string;
  onDoubleClick: () => void;
  onOpenMenu: (el: HTMLElement, row: FinanceRow) => void;
}) {
  const rows = group.kind === 'sale' ? group.parcelas : [group.row];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const balance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const customer = rows[0]?.customer_name || '';
  const nextOpen = rows.filter((r) => r.status === 'open').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const status = groupStatus(group, today);
  const parcelasCount = rows.length;
  const isSale = group.kind === 'sale';
  const saleCode = isSale ? `#${group.saleId.replace(/-/g, '').slice(-6).toUpperCase()}` : '';
  const issueDate = rows
    .map((r) => r.issue_date)
    .filter(Boolean)
    .sort()[0];
  const issueDateBR = issueDate ? issueDate.split('-').reverse().join('/') : '';

  // Row de referência para o menu (usa a próxima em aberto ou a primeira).
  const menuRefRow = nextOpen || rows[0];
  const financeRow: FinanceRow = {
    id: menuRefRow.id,
    document_number: menuRefRow.document_number,
    party_name: menuRefRow.customer_name,
    amount: Number(menuRefRow.amount),
    balance: Number(menuRefRow.balance),
    interest_amount: 0, fine_amount: 0,
    issue_date: menuRefRow.issue_date,
    due_date: menuRefRow.due_date,
    status,
    description: menuRefRow.notes || '',
    origin_type: menuRefRow.origin_type,
    origin_id: menuRefRow.origin_id,
    tags: [],
    pdv_sale_id: menuRefRow.pdv_sale_id,
  };

  return (
    <Card
      className={cn('bg-card/60 cursor-pointer hover:bg-card/80 transition-colors')}
      onDoubleClick={onDoubleClick}
      title="Duplo clique para ver as parcelas"
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">
            {customer}
            {isSale && (
              <>
                <span className="text-muted-foreground font-normal"> · </span>
                <span className="font-mono text-xs">{saleCode}</span>
              </>
            )}
            <span className="text-muted-foreground font-normal"> · </span>
            {parcelasCount > 1 ? `${parcelasCount} parcelas` : '1 título'}
            <span className="text-muted-foreground font-normal"> · Total: </span>
            <span className="text-emerald-500">{brl(total)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Saldo em aberto: <b>{brl(balance)}</b>
            {isSale
              ? issueDateBR && ` · Venda em: ${issueDateBR}`
              : nextOpen && ` · Próx. vencimento: ${nextOpen.due_date.split('-').reverse().join('/')}`}
          </div>
        </div>
        {!isSale && <StatusBadge status={status} />}
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); onOpenMenu(e.currentTarget, financeRow); }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function DetalhesVendaDialog({
  group, onClose, today,
}: {
  group: GroupItem | null;
  onClose: () => void;
  today: string;
}) {
  if (!group) return null;
  const rows = group.kind === 'sale' ? group.parcelas : [group.row];
  const ref = rows[0];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const paid = rows.reduce((s, r) => s + (Number(r.amount) - Number(r.balance)), 0);
  const balance = rows.reduce((s, r) => s + Number(r.balance), 0);

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da venda</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 text-sm">
          <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
            <div><span className="text-muted-foreground">Cliente:</span> <b>{ref.customer_name}</b></div>
            <div><span className="text-muted-foreground">Documento:</span> {ref.customer_document || '—'}</div>
            <div><span className="text-muted-foreground">Telefone:</span> {ref.customer_phone || '—'}</div>
            <div><span className="text-muted-foreground">Emissão:</span> {ref.issue_date.split('-').reverse().join('/')}</div>
            {group.kind === 'sale' && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Venda (PDV):</span> {group.saleId}
              </div>
            )}
            {ref.notes && (
              <div className="col-span-2"><span className="text-muted-foreground">Obs:</span> {ref.notes}</div>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-normal">#</th>
                  <th className="text-left px-3 py-2 font-normal">Documento</th>
                  <th className="text-left px-3 py-2 font-normal">Vencimento</th>
                  <th className="text-right px-3 py-2 font-normal">Valor</th>
                  <th className="text-right px-3 py-2 font-normal">Recebido</th>
                  <th className="text-right px-3 py-2 font-normal">Saldo</th>
                  <th className="text-left px-3 py-2 font-normal">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{r.document_number || '—'}</td>
                    <td className="px-3 py-2">{r.due_date.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(r.amount))}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(r.amount) - Number(r.balance))}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(r.balance))}</td>
                    <td className="px-3 py-2"><StatusBadge status={computeUIStatus(r.status, r.due_date, today)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/20">
                <tr className="text-sm">
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold">TOTAIS</td>
                  <td className="px-3 py-2 text-right font-semibold">{brl(total)}</td>
                  <td className="px-3 py-2 text-right">{brl(paid)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{brl(balance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}