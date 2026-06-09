import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ScanBarcode, X, Plus, Minus, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useProducts } from '@/hooks/useProducts';
import { useCashRegister } from '@/hooks/useCashRegister';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { brl as formatPrice } from '@/components/pdv-v2/_format';
import type { Product } from '@/types/product';
import { applyStockMovementOnce } from '@/hooks/useStockMovements';

interface CartLine {
  id: string; // local uuid
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit: string;
}

/**
 * Frente de Caixa — tela de venda rápida por código de barras,
 * exclusiva para lojas com o módulo `mercado` ativo.
 *
 * Não altera nada do PDV V2, Pedido Express, Cobrança ou TEF — apenas
 * reutiliza `useCashRegister.addSale` e `PDVV2PaymentDialog`.
 */
export default function FrenteCaixa() {
  const { user, company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });
  const {
    currentRegister,
    cashOpenKnown,
    loading: cashLoading,
    addSale,
  } = useCashRegister({ companyId: company?.id });

  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [searchMatches, setSearchMatches] = useState<Product[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // ---- helpers ----
  const activeProducts = useMemo(
    () => products.filter((p) => p.active && p.pdvItem !== false),
    [products],
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0),
    [lines],
  );
  const itemsCount = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );

  // ---- feedback sonoro (Web Audio API) ----
  function beep(ok: boolean) {
    try {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
      }, ok ? 90 : 180);
    } catch {
      /* ignore */
    }
  }

  // ---- foco persistente no input ----
  useEffect(() => {
    const id = setInterval(() => {
      if (paymentOpen || confirmCancel) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'BUTTON')) {
        return;
      }
      inputRef.current?.focus();
    }, 800);
    return () => clearInterval(id);
  }, [paymentOpen, confirmCancel]);

  // ---- atalhos globais ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (paymentOpen || confirmCancel) return;
      if (e.key === 'F2') {
        e.preventDefault();
        tryOpenPayment();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (lines.length > 0) {
          setLines((prev) => prev.slice(0, -1));
          beep(true);
        }
      } else if (e.key === 'Escape') {
        if (lines.length > 0) {
          setConfirmCancel(true);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, paymentOpen, confirmCancel]);

  // ---- lookup ----
  function findProduct(raw: string): { product: Product | null; multiple: Product[] } {
    const q = raw.trim().toLowerCase();
    if (!q) return { product: null, multiple: [] };

    // 1. GTIN exato
    const byGtin = activeProducts.filter(
      (p) => ((p as any).gtin || '').toString() === raw.trim(),
    );
    if (byGtin.length === 1) return { product: byGtin[0], multiple: [] };

    // 2. SKU/code exato
    const byCode = activeProducts.filter(
      (p) => ((p as any).code || '').toString().toLowerCase() === q,
    );
    if (byCode.length === 1) return { product: byCode[0], multiple: [] };

    // 3. Nome (parcial) — só sugere quando houver poucos
    const byName = activeProducts.filter((p) => p.name.toLowerCase().includes(q));
    if (byName.length === 1) return { product: byName[0], multiple: [] };
    if (byName.length > 1 && byName.length <= 12) return { product: null, multiple: byName };

    return { product: null, multiple: [] };
  }

  function addProductToCart(p: Product, qty = 1) {
    let touchedId: string | null = null;
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id);
      if (existing) {
        touchedId = existing.id;
        return prev.map((l) =>
          l.id === existing.id ? { ...l, quantity: l.quantity + qty } : l,
        );
      }
      const newId = crypto.randomUUID();
      touchedId = newId;
      return [
        ...prev,
        {
          id: newId,
          product_id: p.id,
          product_name: p.name,
          quantity: qty,
          unit_price: Number(p.price) || 0,
          unit: ((p as any).unit as string) || 'UN',
        },
      ];
    });
    if (touchedId) setLastTouchedId(touchedId);
    beep(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    // padrão N*CODIGO (multiplicador de quantidade)
    let raw = query.trim();
    let qty = 1;
    const m = /^(\d{1,3})\s*\*\s*(.+)$/.exec(raw);
    if (m) {
      qty = Math.max(1, parseInt(m[1], 10));
      raw = m[2].trim();
    }

    const { product, multiple } = findProduct(raw);
    if (product) {
      addProductToCart(product, qty);
      setQuery('');
      setSearchMatches([]);
      setHighlightIdx(0);
      return;
    }
    if (multiple.length > 0) {
      setSearchMatches(multiple);
      setHighlightIdx(0);
      return;
    }
    toast.error(`Produto não encontrado: ${raw}`);
    beep(false);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (searchMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(searchMatches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = searchMatches[highlightIdx];
      if (p) {
        addProductToCart(p);
        setQuery('');
        setSearchMatches([]);
        setHighlightIdx(0);
      }
    }
  }

  function changeQty(id: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function tryOpenPayment() {
    if (lines.length === 0) {
      toast.info('Bipe pelo menos um produto');
      return;
    }
    if (!currentRegister) {
      toast.error('Abra um caixa antes de vender');
      return;
    }
    setPaymentOpen(true);
  }

  async function handleConfirmPayment(params: {
    paymentMethodId: string;
    paymentName: string;
    discount: number;
    finalTotal: number;
    tefIntegration?: 'tef_pinpad' | 'tef_smartpos';
  }) {
    // Fase 4 (MVP): TEF não é executado aqui — orientar uso do PDV V2.
    if (params.tefIntegration) {
      toast.error('TEF ainda não disponível na Frente de Caixa. Use o PDV V2 ou outra forma.');
      return;
    }
    if (!user?.id) return;
    const saleId = await addSale(
      lines.map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
      params.paymentMethodId,
      user.id,
      params.discount,
      undefined,
      `Venda Frente de Caixa (${params.paymentName})`,
    );
    if (saleId) {
      // Baixa automática de estoque (no-op para produtos sem track_stock).
      // Fire-and-forget: não bloqueia o fluxo de venda nem mostra erro ao operador
      // se algum item falhar — a venda já foi registrada.
      (async () => {
        for (const l of lines) {
          if (!l.product_id) continue;
          await applyStockMovementOnce({
            productId: l.product_id,
            quantity: -l.quantity,
            type: 'sale',
            referenceType: 'pdv_sale',
            referenceId: saleId,
            notes: `Frente de Caixa (${params.paymentName})`,
          });
        }
      })();

      setLines([]);
      setQuery('');
      setLastTouchedId(null);
      setPaymentOpen(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  // ---- guards ----
  if (mercadoLoading) {
    return (
      <PDVV2Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PDVV2Layout>
    );
  }

  if (!mercadoEnabled) {
    return <Navigate to="/pdv-v2" replace />;
  }

  const cashClosed = !cashLoading && cashOpenKnown === false;

  return (
    <PDVV2Layout>
      <div className="h-full flex flex-col bg-background">
        {/* Header compacto */}
        <div className="border-b px-4 py-2 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary" />
            <span className="font-semibold">Frente de Caixa</span>
            <Badge variant="outline" className="ml-2">Mercado</Badge>
            {currentRegister && (
              <Badge variant="secondary" className="ml-1">Caixa aberto</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            <kbd className="px-1 py-0.5 border rounded text-[10px]">F2</kbd> finalizar •{' '}
            <kbd className="px-1 py-0.5 border rounded text-[10px]">F4</kbd> remover último •{' '}
            <kbd className="px-1 py-0.5 border rounded text-[10px]">Esc</kbd> cancelar
          </div>
        </div>

        {cashClosed && (
          <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Nenhum caixa aberto. Abra o caixa em <strong>Financeiro → Caixa</strong> para vender.
          </div>
        )}

        {/* Conteúdo: scanner + lista | total */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
          {/* Coluna esquerda: input + itens */}
          <div className="flex flex-col min-h-0 p-4 gap-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchMatches([]);
                  }}
                  onKeyDown={onInputKey}
                  placeholder="Bipe o código de barras, digite SKU ou nome do produto…"
                  className="pl-10 h-14 text-lg"
                  disabled={!currentRegister}
                />
              </div>
              <Button type="submit" size="lg" disabled={!currentRegister || !query.trim()}>
                Adicionar
              </Button>
            </form>

            {searchMatches.length > 0 && (
              <div className="border rounded-md bg-card max-h-48 overflow-auto">
                {searchMatches.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent ${
                      i === highlightIdx ? 'bg-accent' : ''
                    }`}
                    onClick={() => {
                      addProductToCart(p);
                      setQuery('');
                      setSearchMatches([]);
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {formatPrice(p.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0 border rounded-md bg-card overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>Itens da venda</span>
                <span>{itemsCount} {itemsCount === 1 ? 'item' : 'itens'}</span>
              </div>
              <ScrollArea className="flex-1">
                {lines.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {productsLoading
                      ? 'Carregando produtos…'
                      : 'Nenhum item. Bipe o código de barras para começar.'}
                  </div>
                ) : (
                  <ul className="divide-y">
                    {lines.map((l, idx) => {
                      const isLast = l.id === lastTouchedId;
                      return (
                      <li
                        key={l.id}
                        className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                          isLast ? 'bg-primary/5 ring-2 ring-primary ring-inset' : ''
                        }`}
                      >
                        <span className="w-6 text-right text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{l.product_name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            R$ {l.unit_price.toFixed(3).replace('.', ',')} × {l.quantity} {l.unit}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => changeQty(l.id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm tabular-nums font-medium">
                            {l.quantity}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => changeQty(l.id, +1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="w-20 text-right tabular-nums text-sm font-semibold text-emerald-600">
                          {formatPrice(l.unit_price * l.quantity).replace('.', ',')}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeLine(l.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
              {lines.length > 0 && (
                <div className="border-t bg-muted/40 px-4 py-2 flex items-center justify-end gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-emerald-600">
                    {formatPrice(total)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita: total */}
          <div className="border-l bg-muted/30 flex flex-col p-4 gap-3">
            <div className="rounded-md bg-card border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-4xl font-bold tabular-nums text-emerald-600 mt-1">
                {formatPrice(total)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
              </p>
            </div>

            <Button
              size="lg"
              className="h-16 text-lg"
              onClick={tryOpenPayment}
              disabled={lines.length === 0 || !currentRegister}
            >
              Finalizar (F2)
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                if (lines.length > 0) setConfirmCancel(true);
              }}
              disabled={lines.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Cancelar venda (Esc)
            </Button>

            <div className="mt-auto text-[11px] text-muted-foreground space-y-1">
              <p>Dica: digite <code>3*7891234567890</code> para adicionar 3 unidades.</p>
              <p>TEF integrado ainda não disponível aqui — use o PDV V2.</p>
            </div>
          </div>
        </div>

        {/* Diálogo de pagamento (reusa o do PDV V2, canal pdv) */}
        <PDVV2PaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          companyId={company?.id}
          total={total}
          title="Finalizar Venda — Frente de Caixa"
          channel="pdv"
          onConfirm={handleConfirmPayment}
        />

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar venda em andamento?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os itens bipados serão descartados. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setLines([]);
                  setQuery('');
                  setSearchMatches([]);
                  setLastTouchedId(null);
                  setConfirmCancel(false);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                Cancelar venda
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PDVV2Layout>
  );
}