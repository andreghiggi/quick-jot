import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Split, Trash2, List } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { brl } from '@/components/pdv-v2/_format';
import { ComandaNumberInput } from './ComandaNumberInput';
import { formatComandaNumber } from '@/utils/comandaCode';
import { COMANDA_ALLOWED_FRACTION_DENS } from '@/utils/comandaIndividualAllowList';

export interface ComandaTabItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  paid: boolean;
}

export interface ComandaTab {
  id: string;
  comanda_number: number;
  table_number: number | null;
  created_at: string;
  items: ComandaTabItem[];
}

export interface ComandaFraction {
  reservationId: string;
  sourceItemId: string;
  sourceComanda: number;
  productId: string | null;
  productName: string;
  den: number;
  quantity: number;
  amountCents: number;
}

export interface ComandaChargeLine {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

export interface ComandaChargeReady {
  chargeId: string;
  tabIds: string[];
  comandaNumbers: number[];
  lines: ComandaChargeLine[];
  total: number;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  onProceed: (charge: ComandaChargeReady) => void;
}

function rpcError(err: unknown): string {
  const msg = (err as any)?.message || String(err);
  return msg.replace(/^.*?:\s*/, '') || 'Erro';
}

async function fetchOpenComanda(companyId: string, n: number): Promise<ComandaTab | null> {
  const { data } = await (supabase as any)
    .from('tabs')
    .select('id, comanda_number, created_at, table:tables(number), items:tab_items(id, product_id, product_name, quantity, unit_price, total_price, notes, paid)')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .eq('comanda_number' as any, n)
    .maybeSingle();
  if (!data) return null;
  const d: any = data;
  return {
    id: d.id,
    comanda_number: d.comanda_number,
    table_number: d.table?.number ?? null,
    created_at: d.created_at,
    items: (d.items || []).map((i: any) => ({
      ...i,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      total_price: Number(i.total_price) || 0,
      paid: !!i.paid,
    })),
  };
}

export function ComandaChargeDialog({ open, onOpenChange, companyId, onProceed }: Props) {
  const [tabs, setTabs] = useState<ComandaTab[]>([]);
  const [fractions, setFractions] = useState<ComandaFraction[]>([]);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [chargeTabIds, setChargeTabIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [source, setSource] = useState<ComandaTab | null>(null);
  const [den, setDen] = useState<number>(4);
  const [listOpen, setListOpen] = useState(false);
  const [openList, setOpenList] = useState<Array<{ comanda_number: number; table_number: number | null; total: number; created_at: string }>>([]);

  useEffect(() => {
    if (!open) {
      setTabs([]);
      setFractions([]);
      setChargeId(null);
      setChargeTabIds([]);
      setImportOpen(false);
      setSource(null);
      setListOpen(false);
    }
  }, [open]);

  const unpaid = (t: ComandaTab) => t.items.filter((i) => !i.paid && i.total_price > 0);
  const total = useMemo(() => {
    const base = tabs.reduce((s, t) => s + unpaid(t).reduce((a, i) => a + i.total_price, 0), 0);
    const fr = fractions.reduce((s, f) => s + f.amountCents / 100, 0);
    return Math.round((base + fr) * 100) / 100;
  }, [tabs, fractions]);

  async function addComanda(n: number) {
    if (tabs.some((t) => t.comanda_number === n)) {
      toast.error(`Comanda ${formatComandaNumber(n)} já está nesta cobrança`);
      return;
    }
    setBusy(true);
    try {
      const tab = await fetchOpenComanda(companyId, n);
      if (!tab) {
        toast.error(`Comanda ${formatComandaNumber(n)} não está aberta (já cobrada ou não lançada)`);
        return;
      }
      setTabs((prev) => [...prev, tab]);
    } finally {
      setBusy(false);
    }
  }

  async function cancelChargeRemote(id: string | null) {
    if (!id) return;
    await supabase.rpc('cancel_comanda_charge' as any, { _charge_id: id });
  }

  /** Garante uma cobrança com exatamente as comandas atuais (recria se mudou). */
  async function ensureCharge(currentFractions: ComandaFraction[]): Promise<{ id: string; fractions: ComandaFraction[] } | null> {
    const ids = tabs.map((t) => t.id);
    const same = chargeId && ids.length === chargeTabIds.length && ids.every((x) => chargeTabIds.includes(x));
    if (same) return { id: chargeId!, fractions: currentFractions };
    await cancelChargeRemote(chargeId);
    const { data, error } = await supabase.rpc('create_comanda_charge' as any, { _company_id: companyId, _tab_ids: ids });
    if (error || !data) {
      toast.error(rpcError(error));
      setChargeId(null);
      setChargeTabIds([]);
      setFractions([]);
      return null;
    }
    const newId = data as unknown as string;
    // Re-reserva as frações já escolhidas na nova cobrança
    const redone: ComandaFraction[] = [];
    for (const f of currentFractions) {
      const { data: r, error: e } = await supabase.rpc('reserve_tab_fraction' as any, {
        _charge_id: newId, _source_item_id: f.sourceItemId, _num: 1, _den: f.den,
      });
      if (e || !r) {
        toast.error(`Fração de ${f.productName} não pôde ser mantida: ${rpcError(e)}`);
        continue;
      }
      const rr: any = r;
      redone.push({ ...f, reservationId: rr.id, amountCents: Number(rr.amount_cents), quantity: Number(rr.quantity) });
    }
    setChargeId(newId);
    setChargeTabIds(ids);
    setFractions(redone);
    return { id: newId, fractions: redone };
  }

  async function removeComanda(id: string) {
    setTabs((prev) => prev.filter((t) => t.id !== id));
  }

  async function removeFraction(f: ComandaFraction) {
    await supabase.rpc('cancel_fraction_reservation' as any, { _reservation_id: f.reservationId });
    setFractions((prev) => prev.filter((x) => x.reservationId !== f.reservationId));
  }

  async function loadSource(n: number) {
    if (tabs.some((t) => t.comanda_number === n)) {
      toast.error('Essa comanda já está nesta cobrança');
      return;
    }
    const tab = await fetchOpenComanda(companyId, n);
    if (!tab) {
      toast.error(`Comanda ${formatComandaNumber(n)} não está aberta`);
      return;
    }
    setSource(tab);
  }

  async function reserve(item: ComandaTabItem) {
    if (!source) return;
    if (tabs.length === 0) {
      toast.error('Leia primeiro a comanda que está sendo cobrada');
      return;
    }
    setBusy(true);
    try {
      const ens = await ensureCharge(fractions);
      if (!ens) return;
      const { data, error } = await supabase.rpc('reserve_tab_fraction' as any, {
        _charge_id: ens.id, _source_item_id: item.id, _num: 1, _den: den,
      });
      if (error || !data) {
        toast.error(rpcError(error));
        return;
      }
      const r: any = data;
      setFractions([
        ...ens.fractions,
        {
          reservationId: r.id,
          sourceItemId: item.id,
          sourceComanda: source.comanda_number,
          productId: item.product_id,
          productName: item.product_name,
          den,
          quantity: Number(r.quantity),
          amountCents: Number(r.amount_cents),
        },
      ]);
      toast.success(`1/${den} de ${item.product_name} reservado`);
      setImportOpen(false);
      setSource(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadOpenList() {
    const { data } = await (supabase as any)
      .from('tabs')
      .select('comanda_number, created_at, table:tables(number), items:tab_items(total_price, paid)')
      .eq('company_id', companyId)
      .eq('status', 'open')
      .not('comanda_number' as any, 'is', null)
      .order('comanda_number' as any, { ascending: true });
    setOpenList(
      (data || []).map((t: any) => ({
        comanda_number: t.comanda_number,
        table_number: t.table?.number ?? null,
        created_at: t.created_at,
        total: (t.items || []).filter((i: any) => !i.paid).reduce((s: number, i: any) => s + Number(i.total_price || 0), 0),
      })),
    );
    setListOpen(true);
  }

  async function proceed() {
    if (tabs.length === 0) return;
    setBusy(true);
    try {
      const ens = await ensureCharge(fractions);
      if (!ens) return;
      const lines: ComandaChargeLine[] = [];
      for (const t of tabs) {
        for (const i of unpaid(t)) {
          lines.push({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, notes: i.notes || undefined });
        }
      }
      for (const f of ens.fractions) {
        lines.push({
          product_id: f.productId,
          product_name: f.productName,
          quantity: f.quantity,
          unit_price: Math.round((f.amountCents / 100 / f.quantity) * 100) / 100,
          notes: `1/${f.den} da comanda ${formatComandaNumber(f.sourceComanda)}`,
        });
      }
      const nums = tabs.map((t) => t.comanda_number);
      const tot = Math.round((tabs.reduce((s, t) => s + unpaid(t).reduce((a, i) => a + i.total_price, 0), 0) + ens.fractions.reduce((s, f) => s + f.amountCents / 100, 0)) * 100) / 100;
      onProceed({
        chargeId: ens.id,
        tabIds: tabs.map((t) => t.id),
        comandaNumbers: nums,
        lines,
        total: tot,
        label: `Comanda${nums.length > 1 ? 's' : ''} ${nums.map(formatComandaNumber).join(', ')}`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(o: boolean) {
    if (!o) {
      // Fechou sem cobrar: devolve as frações reservadas
      void cancelChargeRemote(chargeId);
    }
    onOpenChange(o);
  }

  const hoursOpen = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar Comanda</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <ComandaNumberInput onSubmit={addComanda} autoFocus disabled={busy} submitLabel="Adicionar" />
          <Button variant="ghost" size="sm" className="gap-2" onClick={loadOpenList}>
            <List className="h-4 w-4" /> Ver comandas abertas
          </Button>

          {listOpen && (
            <div className="border rounded-md">
              <ScrollArea className="max-h-48">
                {openList.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">Nenhuma comanda aberta.</p>
                ) : (
                  openList.map((c) => (
                    <button
                      key={c.comanda_number}
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/40 border-b last:border-0"
                      onClick={() => { void addComanda(c.comanda_number); }}
                    >
                      <span>
                        Comanda <strong>{formatComandaNumber(c.comanda_number)}</strong>
                        {c.table_number ? ` · Mesa ${c.table_number}` : ''}
                        {hoursOpen(c.created_at) > 3 && <Badge variant="destructive" className="ml-2">+3h aberta</Badge>}
                      </span>
                      <span className="tabular-nums">{brl(c.total)}</span>
                    </button>
                  ))
                )}
              </ScrollArea>
            </div>
          )}

          {tabs.map((t) => (
            <div key={t.id} className="border rounded-md p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">
                  Comanda {formatComandaNumber(t.comanda_number)}
                  {t.table_number ? <span className="text-muted-foreground font-normal"> · Mesa {t.table_number}</span> : null}
                </p>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeComanda(t.id)} aria-label="Remover comanda">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {unpaid(t).length === 0 && <p className="text-xs text-muted-foreground">Sem itens a cobrar.</p>}
              {unpaid(t).map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>{i.quantity}x {i.product_name}</span>
                  <span className="tabular-nums">{brl(i.total_price)}</span>
                </div>
              ))}
            </div>
          ))}

          {fractions.length > 0 && (
            <div className="border rounded-md p-3 space-y-1">
              <p className="font-semibold text-sm">Partes importadas (reservadas)</p>
              {fractions.map((f) => (
                <div key={f.reservationId} className="flex items-center justify-between text-sm gap-2">
                  <span className="flex-1">1/{f.den} {f.productName} <span className="text-muted-foreground">(comanda {formatComandaNumber(f.sourceComanda)})</span></span>
                  <span className="tabular-nums">{brl(f.amountCents / 100)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFraction(f)} aria-label="Remover parte">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" className="w-full gap-2" onClick={() => setImportOpen((v) => !v)} disabled={tabs.length === 0}>
            <Split className="h-4 w-4" /> Importar parte de outra comanda
          </Button>

          {importOpen && (
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              {!source ? (
                <>
                  <p className="text-sm">Comanda de onde vem o item:</p>
                  <ComandaNumberInput onSubmit={loadSource} submitLabel="Abrir" />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Comanda {formatComandaNumber(source.comanda_number)}</p>
                    <Button variant="ghost" size="sm" onClick={() => setSource(null)}>Trocar</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-sm">Parte:</span>
                    {COMANDA_ALLOWED_FRACTION_DENS.map((d) => (
                      <Button key={d} size="sm" variant={den === d ? 'default' : 'outline'} onClick={() => setDen(d)}>
                        1/{d}
                      </Button>
                    ))}
                  </div>
                  {unpaid(source).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem itens disponíveis.</p>
                  ) : (
                    unpaid(source).map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex-1">{i.quantity}x {i.product_name} · {brl(i.total_price)}</span>
                        <Button size="sm" disabled={busy} onClick={() => reserve(i)}>
                          Trazer 1/{den}
                        </Button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}

          <div className="rounded-md border p-3 bg-muted/40 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums">{brl(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button onClick={proceed} disabled={busy || tabs.length === 0 || total <= 0}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cobrar {brl(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
