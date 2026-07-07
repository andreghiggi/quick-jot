import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Filter, ArrowUpDown, RefreshCw, Plus, MoreVertical,
  CheckSquare, Eye, Pencil, Check, RefreshCcw, Trash2, X, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { brl } from '@/components/pdv-v2/_format';

export type FinanceKind = 'receivable' | 'payable';
export type FinanceUIStatus = 'a_vencer' | 'vencida' | 'paga' | 'cancelada' | 'parcial';

export interface FinanceRow {
  id: string;
  document_number: string | null;
  party_name: string; // customer_name ou supplier/description
  amount: number;
  balance: number;
  interest_amount: number;
  fine_amount: number;
  issue_date: string;
  due_date: string;
  status: FinanceUIStatus;
  description: string;
  origin_type: string | null;
  origin_id: string | null;
  tags: string[];
  pdv_sale_id?: string | null;
}

export function computeUIStatus(status: string, dueDate: string, today: string): FinanceUIStatus {
  if (status === 'paid') return 'paga';
  if (status === 'canceled') return 'cancelada';
  if (status === 'partial') return 'parcial';
  return dueDate < today ? 'vencida' : 'a_vencer';
}

export function StatusBadge({ status }: { status: FinanceUIStatus }) {
  const map: Record<FinanceUIStatus, { label: string; cls: string }> = {
    a_vencer:  { label: 'A vencer',  cls: 'bg-sky-500 hover:bg-sky-500 text-white border-transparent' },
    vencida:   { label: 'Vencida',   cls: 'bg-destructive hover:bg-destructive text-destructive-foreground border-transparent' },
    paga:      { label: 'Paga',      cls: 'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent' },
    cancelada: { label: 'Cancelada', cls: 'bg-muted-foreground/40 text-foreground border-transparent' },
    parcial:   { label: 'Parcial',   cls: 'bg-amber-500 hover:bg-amber-500 text-white border-transparent' },
  };
  const it = map[status];
  return (
    <Badge className={cn('rounded-full px-3 py-0.5 text-xs font-semibold', it.cls)}>
      {it.label}
    </Badge>
  );
}

export interface SearchBarProps {
  search: string;
  onSearch: (v: string) => void;
  onToggleFilter: () => void;
  onToggleSort: () => void;
  onRefresh: () => void;
  sortLabel?: string;
}

export function FinanceSearchBar({ search, onSearch, onToggleFilter, onToggleSort, onRefresh, sortLabel }: SearchBarProps) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Digite para buscar..."
          className="border-0 shadow-none focus-visible:ring-0 bg-transparent"
        />
        <Button variant="ghost" size="icon" onClick={onToggleFilter} title="Filtrar">
          <Filter className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggleSort} title={sortLabel || 'Ordenar'}>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRefresh} title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export interface FinanceFilters {
  status: 'all' | FinanceUIStatus;
  party: string;
  issueFrom: string;
  issueTo: string;
  dueFrom: string;
  dueTo: string;
  document: string;
  tags: string;
}

export const emptyFilters: FinanceFilters = {
  status: 'all', party: '', issueFrom: '', issueTo: '', dueFrom: '', dueTo: '', document: '', tags: '',
};

/** Remove acentos e converte para minúsculas para busca flexível. */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function PartyAutocomplete({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const normalizedInput = normalizeSearch(inputValue);
  const showSuggestions = normalizedInput.length >= 2;

  const filtered = useMemo(() => {
    if (!showSuggestions) return [];
    const map = new Map<string, string>();
    for (const opt of options) {
      const normalized = normalizeSearch(opt);
      if (normalized.includes(normalizedInput)) {
        map.set(normalized, opt);
      }
    }
    return Array.from(map.values()).slice(0, 50);
  }, [options, normalizedInput, showSuggestions]);

  const selectOption = (name: string) => {
    setInputValue(name);
    onChange(name);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Input
            ref={inputRef}
            value={inputValue}
            placeholder={placeholder || 'Digite o nome'}
            onChange={(e) => {
              const v = e.target.value;
              setInputValue(v);
              onChange(v);
              setOpen(true);
            }}
            onFocus={() => {
              if (normalizeSearch(inputValue).length >= 2) setOpen(true);
            }}
          />
        </PopoverTrigger>
        <PopoverContent
          className="p-1 w-[var(--radix-popover-trigger-width)] max-h-[260px] overflow-auto"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="space-y-0.5">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => selectOption(name)}
                className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground truncate"
              >
                {name}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


export function FinanceFilterPanel({
  open, filters, setFilters, partyLabel, partyOptions, onApply, onClear,
}: {
  open: boolean;
  filters: FinanceFilters;
  setFilters: (f: FinanceFilters) => void;
  partyLabel: string;
  partyOptions?: string[];
  onApply: () => void;
  onClear: () => void;
}) {
  if (!open) return null;
  const set = (patch: Partial<FinanceFilters>) => setFilters({ ...filters, ...patch });
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Filtrar</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={onClear} title="Limpar"><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={onApply} title="Aplicar"><Filter className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {partyOptions ? (
            <PartyAutocomplete
              label={partyLabel}
              value={filters.party}
              onChange={(v) => set({ party: v })}
              options={partyOptions}
              placeholder="Digite o nome"
            />
          ) : (
            <div className="grid gap-1.5">
              <Label>{partyLabel}</Label>
              <Input value={filters.party} onChange={(e) => set({ party: e.target.value })} placeholder="Digite o nome" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(v) => set({ status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="a_vencer">A vencer</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="paga">Paga/Recebida</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <div className="grid gap-1.5"><Label>Emissão inicial</Label>
            <Input type="date" value={filters.issueFrom} onChange={(e) => set({ issueFrom: e.target.value })} />
          </div>
          <div className="grid gap-1.5"><Label>Emissão final</Label>
            <Input type="date" value={filters.issueTo} onChange={(e) => set({ issueTo: e.target.value })} />
          </div>
          <div className="grid gap-1.5"><Label>Vencimento inicial</Label>
            <Input type="date" value={filters.dueFrom} onChange={(e) => set({ dueFrom: e.target.value })} />
          </div>
          <div className="grid gap-1.5"><Label>Vencimento final</Label>
            <Input type="date" value={filters.dueTo} onChange={(e) => set({ dueTo: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Nº do documento</Label>
            <Input value={filters.document} onChange={(e) => set({ document: e.target.value })} placeholder="Separe múltiplos por vírgula" />
          </div>
          <div className="grid gap-1.5">
            <Label>Tags</Label>
            <Input value={filters.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="Separe por vírgula" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={onApply}>APLICAR</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function applyFilters<T extends FinanceRow>(rows: T[], f: FinanceFilters, search: string): T[] {
  const s = normalizeSearch(search.trim());
  const docs = f.document.split(',').map(x => normalizeSearch(x.trim())).filter(Boolean);
  const tags = f.tags.split(',').map(x => normalizeSearch(x.trim())).filter(Boolean);
  const partyFilter = normalizeSearch(f.party.trim());
  return rows.filter((r) => {
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (partyFilter && !normalizeSearch(r.party_name).includes(partyFilter)) return false;
    if (f.issueFrom && r.issue_date < f.issueFrom) return false;
    if (f.issueTo && r.issue_date > f.issueTo) return false;
    if (f.dueFrom && r.due_date < f.dueFrom) return false;
    if (f.dueTo && r.due_date > f.dueTo) return false;
    if (docs.length && !docs.some(d => normalizeSearch(r.document_number || '').includes(d))) return false;
    if (tags.length && !tags.some(t => r.tags.some(rt => normalizeSearch(rt).includes(t)))) return false;
    if (s) {
      const hay = normalizeSearch(`${r.party_name} ${r.document_number || ''} ${r.description}`);
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}

export interface PageSize {
  page: number;
  size: number;
  total: number;
  setPage: (n: number) => void;
  setSize: (n: number) => void;
}

export function Pagination({ page, size, total, setPage, setSize }: PageSize) {
  const start = total === 0 ? 0 : (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  const maxPage = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-end gap-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Por página</span>
        <Select value={String(size)} onValueChange={(v) => { setSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="text-muted-foreground tabular-nums">{start} – {end} / {total}</div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
        <Button variant="ghost" size="icon" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>›</Button>
      </div>
    </div>
  );
}

export function FinanceCard({
  row, selected, selectionMode, onToggleSelect, onOpenMenu, onOpenCard,
}: {
  row: FinanceRow;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: () => void;
  onOpenMenu: (target: HTMLElement) => void;
  onOpenCard?: () => void;
}) {
  const fmt = (d: string) => d.split('-').reverse().join('/');
  return (
    <Card
      className={cn(
        'bg-card/60',
        selected && 'ring-2 ring-primary',
        !selectionMode && onOpenCard && 'cursor-pointer hover:bg-card/80 transition-colors',
      )}
      onClick={selectionMode || !onOpenCard ? undefined : onOpenCard}
    >
      <CardContent className="p-3 flex items-center gap-3">
        {selectionMode ? (
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mx-1" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-muted-foreground">
              {row.party_name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">
            {row.document_number ? `Doc.: ${row.document_number}` : row.party_name}
            <span className="text-muted-foreground font-normal"> | </span>
            Valor: <span className="text-emerald-500">{brl(Number(row.amount))}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Emitida em {fmt(row.issue_date)} | Vence em {fmt(row.due_date)}
          </div>
        </div>
        <StatusBadge status={row.status} />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); onOpenMenu(e.currentTarget); }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function FinanceActionMenu({
  open, anchorRef, onClose, canQuitar, onSelectMark, onDetails, onEdit, onQuitar, onRenegotiate, onDelete,
  quitarLabel = 'Receber',
}: {
  open: boolean;
  anchorRef: HTMLElement | null;
  onClose: () => void;
  canQuitar: boolean;
  onSelectMark: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onQuitar: () => void;
  onRenegotiate: () => void;
  onDelete: () => void;
  quitarLabel?: string;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span style={{ position: 'fixed', top: anchorRef?.getBoundingClientRect().top ?? 0, left: anchorRef?.getBoundingClientRect().left ?? 0 }} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <MenuItem icon={CheckSquare} onClick={() => { onSelectMark(); onClose(); }}>Marcar</MenuItem>
        <MenuItem icon={Eye} onClick={() => { onDetails(); onClose(); }}>Ver detalhes</MenuItem>
        <MenuItem icon={Pencil} onClick={() => { onEdit(); onClose(); }}>Editar</MenuItem>
        {canQuitar && <MenuItem icon={Check} onClick={() => { onQuitar(); onClose(); }}>{quitarLabel}</MenuItem>}
        {canQuitar && <MenuItem icon={RefreshCcw} onClick={() => { onRenegotiate(); onClose(); }}>Renegociar</MenuItem>}
        <MenuItem icon={Trash2} onClick={() => { onDelete(); onClose(); }} destructive>Excluir</MenuItem>
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({ icon: Icon, children, onClick, destructive }: { icon: any; children: React.ReactNode; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </button>
  );
}

export function FinanceDetailModal({
  row, open, onClose, onEdit, originLabel,
}: {
  row: FinanceRow | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  originLabel?: string;
}) {
  if (!row) return null;
  const fmt = (d: string) => d.split('-').reverse().join('/');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Documento:</Label>
              <DialogTitle className="text-base font-medium">{row.document_number || '—'}</DialogTitle>
            </div>
            <StatusBadge status={row.status} />
          </div>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4 pt-2">
          <Field label="Valor" value={brl(Number(row.amount))} />
          <Field label="Juros e multa" value={brl(Number(row.interest_amount) + Number(row.fine_amount))} />
          <Field label="Saldo" value={brl(Number(row.balance))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Data de emissão" value={fmt(row.issue_date)} />
          <Field label="Data de vencimento" value={fmt(row.due_date)} />
        </div>
        <Field label="Descrição" value={row.description || '—'} />
        {row.origin_type && (
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Acessar origem:</Label>
            <div>
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                {originLabel || row.origin_type} <ExternalLink className="h-3 w-3" />
              </Badge>
            </div>
          </div>
        )}
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" onClick={onClose}>MAIS DETALHES</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onEdit}>EDITAR</Button>
            <Button variant="ghost" onClick={onClose}>FECHAR</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-xs">{label}:</Label>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function FloatingFab({ onClick, label = 'Novo' }: { onClick: () => void; label?: string }) {
  return (
    <Button
      onClick={onClick}
      title={label}
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 z-40 p-0"
    >
      <Plus className="h-6 w-6" />
    </Button>
  );
}

export function RenegotiateDialog({
  open, onOpenChange, current, onConfirm, busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: FinanceRow | null;
  onConfirm: (newAmount: number, newDueDate: string, reason: string) => Promise<void>;
  busy: boolean;
}) {
  const [amt, setAmt] = useState('');
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');

  if (!current) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (o) {
        setAmt(String(current.balance).replace('.', ','));
        setDue(current.due_date);
        setReason('');
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renegociar título</DialogTitle>
          <DialogDescription>
            Documento {current.document_number || '—'} — saldo atual {brl(Number(current.balance))}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Novo valor</Label>
              <Input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" />
            </div>
            <div className="grid gap-1.5"><Label>Novo vencimento</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Ex.: acordo com o cliente" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button
            onClick={async () => {
              const n = Number(amt.replace(/\./g, '').replace(',', '.'));
              if (!Number.isFinite(n) || n <= 0 || !due) return;
              await onConfirm(n, due, reason.trim());
            }}
            disabled={busy}
          >
            {busy ? '...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, onConfirm, busy, destructive,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; description: string;
  onConfirm: () => void; busy: boolean; destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Voltar</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
            {busy ? '...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkActionBar({
  count, onClear, onBulkPay, onBulkDelete, quitarLabel,
}: {
  count: number; onClear: () => void;
  onBulkPay: () => void; onBulkDelete?: () => void;
  quitarLabel: string;
}) {
  if (count === 0) return null;
  return (
    <Card className="sticky top-2 z-20 bg-primary text-primary-foreground">
      <CardContent className="p-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClear} className="hover:bg-white/20">
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{count} selecionado(s)</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={onBulkPay} className="gap-1">
            <Check className="h-4 w-4" /> {quitarLabel}
          </Button>
          {onBulkDelete && (
            <Button size="sm" variant="destructive" onClick={onBulkDelete} className="gap-1">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}