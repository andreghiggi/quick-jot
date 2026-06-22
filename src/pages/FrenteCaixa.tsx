import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ScanBarcode, X, Plus, Minus, Loader2, AlertTriangle, Trash2, Tag, MoreHorizontal, Maximize2, Minimize2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useCardapioEnabled } from '@/hooks/useCardapioEnabled';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useProducts } from '@/hooks/useProducts';
import { useCashRegister } from '@/hooks/useCashRegister';
import { brl as formatPrice } from '@/components/pdv-v2/_format';
import {
  FrenteCaixaCheckoutDialog,
  type FrenteCaixaCheckoutResult,
} from '@/components/frente-caixa/FrenteCaixaCheckoutDialog';
import {
  FrenteCaixaPriceDialog,
  type PriceChange,
} from '@/components/frente-caixa/FrenteCaixaPriceDialog';
import {
  FrenteCaixaItemDetailsDialog,
  type ItemDetailsResult,
} from '@/components/frente-caixa/FrenteCaixaItemDetailsDialog';
import { FrenteCaixaActionsMenu } from '@/components/frente-caixa/FrenteCaixaActionsMenu';
import {
  FrenteCaixaCashMovementDialog,
  type CashMovementType,
} from '@/components/frente-caixa/FrenteCaixaCashMovementDialog';
import { FrenteCaixaInutilizarNfceDialog } from '@/components/frente-caixa/FrenteCaixaInutilizarNfceDialog';
import { FrenteCaixaXmlMesDialog } from '@/components/frente-caixa/FrenteCaixaXmlMesDialog';
import {
  FrenteCaixaImportDialog,
  type ImportableOrder,
} from '@/components/frente-caixa/FrenteCaixaImportDialog';
import type { Product } from '@/types/product';
import { applyStockMovementOnce } from '@/hooks/useStockMovements';
import { printCurrentCashClosing } from '@/utils/printCurrentCashClosing';
import { usePdvSettings } from '@/hooks/usePdvSettings';
import { useTaxRules } from '@/hooks/useTaxRules';
import { emitirNFCe, type NFCeItem } from '@/services/nfceService';
import { buildNfceFiscalFields } from '@/utils/nfceItemFiscal';
import { buildPagamentosSplit } from '@/utils/pdvV2MultiPayment';
import { supabase } from '@/integrations/supabase/client';

interface CartLine {
  id: string; // local uuid
  product_id: string | null;
  product_name: string;
  quantity: number;
  /** Preço unitário original do produto (referência imutável) */
  unit_price: number;
  /** Preço unitário efetivo (após "Alteração no valor" ou edição) */
  effective_unit_price: number;
  /** Desconto em R$ aplicado à linha inteira */
  line_discount: number;
  /** Acréscimo em R$ aplicado à linha inteira */
  line_surcharge: number;
  unit: string;
  /** Itens importados de um pedido/mesa são imutáveis no carrinho do FC. */
  imported?: boolean;
  /** Observações originais do pedido importado (não editáveis). */
  imported_notes?: string;
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
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  // Cardápio é "ligado por padrão" (sem registro = ativo). Usa o hook dedicado.
  const { enabled: cardapioModuleEnabled } = useCardapioEnabled(company?.id);
  const mesaQrModuleEnabled = isModuleEnabled('cardapio_mesa');
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });
  const { settings: pdvSettings } = usePdvSettings(company?.id);
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const {
    currentRegister,
    cashOpenKnown,
    loading: cashLoading,
    addSale,
    openRegister,
    isOpening,
  } = useCashRegister({ companyId: company?.id });

  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Diálogo de abertura de caixa (acessível direto pelo banner do FC).
  const [openCashOpen, setOpenCashOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [searchMatches, setSearchMatches] = useState<Product[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<CartLine | null>(null);
  const [removeQty, setRemoveQty] = useState<string>('1');
  // Confirmação ao remover/zerar uma linha do carrinho (atalho ↓, botão −, lixeira).
  const [confirmDelete, setConfirmDelete] = useState<CartLine | null>(null);
  const [priceTarget, setPriceTarget] = useState<CartLine | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<CartLine | null>(null);
  const [cashMovementOpen, setCashMovementOpen] = useState<null | CashMovementType>(null);
  // Rail lateral fixo — inicia aberto por padrão; persiste preferência em localStorage.
  const [menuOpen, setMenuOpenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('frenteCaixa.menuOpen') !== 'false';
    } catch {
      return true;
    }
  });
  const setMenuOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    setMenuOpenState((prev) => {
      const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(prev) : v;
      try { localStorage.setItem('frenteCaixa.menuOpen', next ? 'true' : 'false'); } catch {/*noop*/}
      return next;
    });
  };
  const [inutOpen, setInutOpen] = useState(false);
  const [xmlMesOpen, setXmlMesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Importação de pedido/mesa
  const [importDialog, setImportDialog] = useState<null | 'pedido' | 'mesa'>(null);
  /** ID do pedido em `orders` que foi importado para o carrinho. */
  const [importedOrderId, setImportedOrderId] = useState<string | null>(null);
  /** Rótulo curto para a UI (ex.: "M-001" ou "R-023"). */
  const [importedLabel, setImportedLabel] = useState<string | null>(null);

  // Persiste o carrinho em localStorage para que outras telas (ex.: Caixas)
  // possam detectar venda pendente antes de fechar o caixa.
  useEffect(() => {
    try {
      if (lines.length > 0) {
        localStorage.setItem('frenteCaixa.cartPendingCount', String(lines.length));
      } else {
        localStorage.removeItem('frenteCaixa.cartPendingCount');
      }
    } catch {/*noop*/}
  }, [lines.length]);

  // ---------------------------------------------------------------
  // Proteção contra perda de venda em andamento
  // ---------------------------------------------------------------
  // Quando há itens no carrinho, avisa antes do usuário recarregar/fechar
  // a aba (popup nativo do navegador) e antes de navegar para outra rota
  // dentro do app (AlertDialog customizado).
  const hasUnsavedSale = lines.length > 0;
  // Quando o usuário confirma sair/recarregar pelo nosso dialog, suprimimos
  // o beforeunload nativo para não aparecer o popup do navegador em cima.
  const suppressBeforeUnloadRef = useRef(false);

  useEffect(() => {
    if (!hasUnsavedSale) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (suppressBeforeUnloadRef.current) return;
      e.preventDefault();
      // Texto é ignorado pelos navegadores modernos, mas é necessário para disparar o popup.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedSale]);

  // Intercepta cliques em links internos (<a href="/...">) quando há venda
  // em andamento, abrindo um dialog de confirmação.
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  // Confirmação customizada para F5 / Ctrl+R / Cmd+R.
  const [confirmReload, setConfirmReload] = useState(false);
  useEffect(() => {
    if (!hasUnsavedSale) return;
    const onKey = (e: KeyboardEvent) => {
      const isF5 = e.key === 'F5';
      const isCtrlR = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R');
      if (!isF5 && !isCtrlR) return;
      e.preventDefault();
      e.stopPropagation();
      setConfirmReload(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hasUnsavedSale]);
  useEffect(() => {
    if (!hasUnsavedSale) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || anchor.target === '_blank') return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNavPath(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [hasUnsavedSale]);

  const inputRef = useRef<HTMLInputElement>(null);

  // ---- fullscreen ----
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // ---- helpers ----
  const activeProducts = useMemo(
    () => products.filter((p) => p.active && p.pdvItem !== false),
    [products],
  );

  // Auto-adicionar ao bipar: se o que está no campo bater EXATAMENTE com um GTIN
  // de produto ativo, adiciona direto (sem precisar de Enter). Aceita também o
  // padrão "N*GTIN" para múltiplas unidades. Só dispara para valores numéricos
  // com 8+ dígitos para não conflitar com busca por código curto ou nome.
  useEffect(() => {
    const raw = query.trim();
    if (!raw) return;
    let qty = 1;
    let code = raw;
    const m = /^(\d{1,3})\s*\*\s*(.+)$/.exec(raw);
    if (m) {
      qty = Math.max(1, parseInt(m[1], 10));
      code = m[2].trim();
    }
    if (!/^\d{8,14}$/.test(code)) return;
    const match = activeProducts.find(
      (p) => ((p as any).gtin || '').toString() === code,
    );
    if (match) {
      addProductToCart(match, qty);
      setQuery('');
      setSearchMatches([]);
      setHighlightIdx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeProducts]);

  const total = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum + l.effective_unit_price * l.quantity - l.line_discount + l.line_surcharge,
        0,
      ),
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
      if (paymentOpen || confirmCancel || priceTarget || detailsTarget || removeTarget) return;
      if (e.key === 'F2') {
        e.preventDefault();
        tryOpenPayment();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (lines.length > 0) {
          setLines((prev) => prev.slice(0, -1));
          beep(true);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (!pdvSettings.allow_price_change_on_sale) return;
        const target = lines.find((l) => l.id === lastTouchedId) ?? lines[lines.length - 1];
        if (target) setPriceTarget(target);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const target = lines.find((l) => l.id === lastTouchedId) ?? lines[lines.length - 1];
        if (target) setDetailsTarget(target);
      } else if (e.key === 'Escape') {
        if (lines.length > 0) {
          setConfirmCancel(true);
        }
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (currentRegister) setCashMovementOpen('suprimento');
      } else if (e.key === 'F7') {
        e.preventDefault();
        if (currentRegister) setCashMovementOpen('sangria');
      } else if (e.key === 'F10') {
        e.preventDefault();
        setMenuOpen((o) => !o);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Aumenta/diminui qty da última linha mexida.
        // Só age quando NÃO há sugestões de busca abertas (senão as setas
        // continuam navegando o dropdown, como hoje).
        if (searchMatches.length > 0) return;
        if (lines.length === 0) return;
        e.preventDefault();
        const target = lines.find((l) => l.id === lastTouchedId) ?? lines[lines.length - 1];
        if (!target) return;
        const delta = e.key === 'ArrowUp' ? 1 : -1;
        // Se for diminuir e a qty atual já está em 1, pedir confirmação
        // ao invés de remover silenciosamente a linha.
        if (delta === -1 && target.quantity <= 1) {
          setConfirmDelete(target);
          return;
        }
        setLines((prev) =>
          prev
            .map((l) => (l.id === target.id ? { ...l, quantity: l.quantity + delta } : l))
            .filter((l) => l.quantity > 0),
        );
        setLastTouchedId(target.id);
        beep(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, paymentOpen, confirmCancel, priceTarget, detailsTarget, removeTarget, lastTouchedId, currentRegister, searchMatches]);

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
    const price = Number(p.price) || 0;
    if (pdvSettings.block_sale_without_price && price <= 0) {
      toast.error(`Produto sem preço cadastrado: ${p.name}`);
      beep(false);
      return;
    }
    if (
      pdvSettings.confirm_quantity_above > 0 &&
      qty > pdvSettings.confirm_quantity_above
    ) {
      const ok = window.confirm(`Confirmar adição de ${qty} unidades de "${p.name}"?`);
      if (!ok) {
        beep(false);
        return;
      }
    }
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
          unit_price: price,
          effective_unit_price: price,
          line_discount: 0,
          line_surcharge: 0,
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
    // Se for diminuir e a linha está com qty 1, abrir confirmação.
    if (delta < 0) {
      const line = lines.find((l) => l.id === id);
      if (line && !line.imported && line.quantity + delta <= 0) {
        setConfirmDelete(line);
        return;
      }
    }
    setLines((prev) =>
      prev
        .map((l) => (l.id === id && !l.imported ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function requestRemoveLine(line: CartLine) {
    if (line.imported) {
      toast.error('Item importado não pode ser removido.');
      return;
    }
    if (line.quantity <= 1) {
      setConfirmDelete(line);
      return;
    }
    setRemoveTarget(line);
    setRemoveQty('1');
  }

  function confirmRemoveQty() {
    if (!removeTarget) return;
    const max = removeTarget.quantity;
    const n = Math.max(1, Math.min(max, parseInt(removeQty, 10) || 1));
    setLines((prev) =>
      prev
        .map((l) =>
          l.id === removeTarget.id ? { ...l, quantity: l.quantity - n } : l,
        )
        .filter((l) => l.quantity > 0),
    );
    if (n >= max) {
      setLastTouchedId((curr) => (curr === removeTarget.id ? null : curr));
    }
    setRemoveTarget(null);
    setRemoveQty('1');
    beep(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function tryOpenPayment() {
    if (lines.length === 0) {
      toast.info('Bipe pelo menos um produto');
      return;
    }
    if (pdvSettings.cash_control_enabled && !currentRegister) {
      toast.error('Abra um caixa antes de vender');
      return;
    }
    setPaymentOpen(true);
  }

  function applyPriceChange(target: CartLine, change: PriceChange) {
    if (target.imported) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== target.id) return l;
        if (change.mode === 'override') {
          return { ...l, effective_unit_price: change.value };
        }
        if (change.mode === 'discount') {
          return { ...l, line_discount: l.line_discount + change.value };
        }
        // surcharge
        return { ...l, line_surcharge: l.line_surcharge + change.value };
      }),
    );
    setLastTouchedId(target.id);
    beep(true);
  }

  function applyDetailsChange(target: CartLine, result: ItemDetailsResult) {
    if (target.imported) return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === target.id
          ? {
              ...l,
              quantity: result.quantity,
              effective_unit_price: result.unitPrice,
              line_discount: result.discount,
            }
          : l,
      ),
    );
    setLastTouchedId(target.id);
    beep(true);
  }

  // ---- importação de pedido/mesa ----
  function handleImportOrder(order: ImportableOrder) {
    if (importedOrderId) {
      toast.error('Já existe um pedido importado neste carrinho.');
      return;
    }
    const newLines: CartLine[] = order.items.map((it) => ({
      id: crypto.randomUUID(),
      product_id: it.product_id,
      product_name: it.name,
      quantity: it.quantity,
      unit_price: it.price,
      effective_unit_price: it.price,
      line_discount: 0,
      line_surcharge: 0,
      unit: 'UN',
      imported: true,
      imported_notes: it.notes || undefined,
    }));
    // Itens importados vão sempre no topo do carrinho
    setLines((prev) => [...newLines, ...prev]);
    setImportedOrderId(order.id);
    setImportedLabel(order.short_code || 'Importado');
    toast.success(
      `${order.short_code || 'Pedido'} importado (${newLines.length} ${newLines.length === 1 ? 'item' : 'itens'}).`,
    );
    beep(true);
  }

  function productCode(l: CartLine): string {
    const p = products.find((pp) => pp.id === l.product_id) as any;
    return (p?.gtin || p?.code || p?.sku || l.product_id || '—').toString();
  }

  async function handleConfirmPayment(params: FrenteCaixaCheckoutResult) {
    if (!user?.id) return;
    const noteParts: string[] = [`[FRENTE-CAIXA] Pagamento: ${params.paymentName}`];
    if (params.combinedNotesFragment) noteParts.push(params.combinedNotesFragment);
    if (params.customerPhone) noteParts.push(`Tel: ${params.customerPhone}`);
    if (params.customerDocument) noteParts.push(`CPF: ${params.customerDocument}`);
    if (params.surcharge > 0) noteParts.push(`Acréscimo: ${formatPrice(params.surcharge)}`);
    if (params.notes) noteParts.push(`Obs: ${params.notes}`);
    // Ajustes por item (Alterar preço / Editar detalhes) — registrados em separado
    lines.forEach((l, idx) => {
      if (l.effective_unit_price !== l.unit_price) {
        noteParts.push(
          `Item ${idx + 1} ${l.product_name}: preço ${formatPrice(l.unit_price)} → ${formatPrice(l.effective_unit_price)}`,
        );
      }
      if (l.line_discount > 0) {
        noteParts.push(
          `Item ${idx + 1} ${l.product_name}: desconto ${formatPrice(l.line_discount)}`,
        );
      }
      if (l.line_surcharge > 0) {
        noteParts.push(
          `Item ${idx + 1} ${l.product_name}: acréscimo ${formatPrice(l.line_surcharge)}`,
        );
      }
    });
    const saleId = await addSale(
      lines.map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        // Preço unitário efetivo já contemplando override + desconto/acréscimo da linha
        unit_price: Math.max(
          0,
          (l.effective_unit_price * l.quantity - l.line_discount + l.line_surcharge) /
            Math.max(l.quantity, 0.0001),
        ),
      })),
      params.paymentMethodId,
      user.id,
      params.discount,
      params.customerName,
      noteParts.join(' | '),
      undefined,
      params.fiscalMode,
      'mercado',
    );
    if (saleId) {
      // Importação: vincula o pedido original à venda do FC e marca como entregue.
      // Itens importados são imutáveis, então a soma bate com o pedido original.
      if (importedOrderId) {
        try {
          await supabase
            .from('orders')
            .update({ status: 'delivered', pdv_sale_id: saleId })
            .eq('id', importedOrderId);
          await supabase
            .from('pdv_sales')
            .update({ imported_order_id: importedOrderId })
            .eq('id', saleId);
        } catch (err) {
          console.error('[FrenteCaixa] vínculo pedido importado falhou:', err);
          toast.error('Venda salva, mas falha ao marcar o pedido como pago.');
        }
      }

      // Baixa automática de estoque (no-op para produtos sem track_stock).
      // Fase A.2: quando `stock_move_on_fiscal_only` está ligado, NÃO baixa
      // estoque aqui — a baixa fica reservada à emissão fiscal (NFC-e).
      // Fase 1 fiscal: se a venda é não-fiscal e o operador escolheu
      // "movimentar só na nota", a baixa fica pendente até a NFC-e ser emitida
      // (retroativa via Lista do PDV).
      const shouldMoveStockNow = !pdvSettings.stock_move_on_fiscal_only ||
        params.fiscalMode === 'fiscal';
      if (shouldMoveStockNow) {
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
      }

      // Fase 1+2 fiscal: se o operador escolheu emitir NFC-e, dispara agora.
      // Não bloqueia o fechamento do checkout — toast informa rejeição.
      if (params.fiscalMode === 'fiscal' && company?.id) {
        (async () => {
          try {
            const nfceItems: NFCeItem[] = lines.map((l) => {
              const product = l.product_id ? products.find((p) => p.id === l.product_id) : null;
              const taxRule = (product as any)?.taxRuleId
                ? taxRules.find((tr) => tr.id === (product as any).taxRuleId)
                : null;
              const fallbackNcm = l.product_id ? '00000000' : '21069090';
              const unitNet = Math.max(
                0,
                (l.effective_unit_price * l.quantity - l.line_discount + l.line_surcharge) /
                  Math.max(l.quantity, 0.0001),
              );
              return {
                codigo: (product as any)?.code || l.product_id || 'AVULSO',
                descricao: l.product_name,
                unidade: ((product as any)?.unit as string) || l.unit || 'UN',
                quantidade: l.quantity,
                valor_unitario: unitNet,
                ...buildNfceFiscalFields({ product: product as any, taxRule, mercadoEnabled, fallbackNcm }),
              };
            });
            const cleanDoc = (params.customerDocument || '').replace(/\D/g, '');
            const destinatario = cleanDoc.length === 11
              ? { cpf: cleanDoc, nome: params.customerName || undefined }
              : cleanDoc.length === 14
                ? { cnpj: cleanDoc, nome: params.customerName || undefined }
                : undefined;
            const externalId = `FCX-${currentRegister?.id?.substring(0, 8) || 'NOCR'}-${Date.now()}`;
            await emitirNFCe(company.id, saleId, {
              external_id: externalId,
              itens: nfceItems,
              valor_desconto: params.discount || 0,
              valor_frete: 0,
              observacoes: params.customerName ? `Cliente: ${params.customerName}` : undefined,
              destinatario,
              pagamentos_split: buildPagamentosSplit(params.mpLines),
            } as any);
            toast.success('NFC-e enviada para processamento.');
          } catch (err: any) {
            console.error('[FrenteCaixa] NFC-e error:', err);
            toast.error(`Venda salva, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`);
          }
        })();
      }

      // Fase A.2: ação ao salvar a venda (impressão do cupom).
      const mode = pdvSettings.print_on_finish_mode;
      if (mode === 'auto') {
        // TODO Fase B: chamar a impressão real do cupom da Frente de Caixa.
        toast.success('Cupom enviado para impressão.');
      } else if (mode === 'ask') {
        const ok = window.confirm('Imprimir cupom desta venda?');
        if (ok) {
          // TODO Fase B: chamar a impressão real do cupom da Frente de Caixa.
          toast.success('Cupom enviado para impressão.');
        }
      }

      setLines([]);
      setQuery('');
      setLastTouchedId(null);
      setImportedOrderId(null);
      setImportedLabel(null);
      setPaymentOpen(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function handleRelFechamento() {
    navigate('/relatorios/caixa');
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

  const cashClosed =
    pdvSettings.cash_control_enabled && !cashLoading && cashOpenKnown === false;

  return (
    <PDVV2Layout>
      <div
        className={`h-full flex flex-col bg-background transition-[padding] duration-200 ${
          menuOpen ? 'pr-80' : 'pr-0'
        }`}
      >
        {/* Header compacto */}
        <div className="border-b px-4 py-2 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary" />
            <span className="font-semibold">Frente de Caixa</span>
            <Badge variant="outline" className="ml-2">Loja</Badge>
            {currentRegister && (
              <Badge variant="secondary" className="ml-1">Caixa aberto</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground hidden md:block">
              <kbd className="px-1 py-0.5 border rounded text-[10px]">F2</kbd> finalizar •{' '}
              <kbd className="px-1 py-0.5 border rounded text-[10px]">F4</kbd> remover último •{' '}
              <kbd className="px-1 py-0.5 border rounded text-[10px]">Esc</kbd> cancelar
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {cashClosed && (
          <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Nenhum caixa aberto. Abra o caixa para começar a vender.</span>
            </div>
            <Button
              size="sm"
              onClick={() => setOpenCashOpen(true)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Abrir Caixa
            </Button>
          </div>
        )}

        {/* Conteúdo: coluna única vertical (estilo Gweb) — scanner → itens → total → finalizar */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full max-w-5xl mx-auto flex flex-col min-h-0 p-4 gap-3">
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
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
                      i === highlightIdx
                        ? 'bg-accent text-accent-foreground border-l-2 border-primary'
                        : 'border-l-2 border-transparent hover:bg-muted'
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
                <span className="flex items-center gap-2">
                  Itens da venda
                  {importedLabel && (
                    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 text-[10px]">
                      Pedido {importedLabel} importado
                    </Badge>
                  )}
                </span>
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
                      const lineGross = l.effective_unit_price * l.quantity;
                      const lineTotal = lineGross - l.line_discount + l.line_surcharge;
                      const hasAdjust =
                        l.effective_unit_price !== l.unit_price ||
                        l.line_discount > 0 ||
                        l.line_surcharge > 0;
                      return (
                      <ContextMenu key={l.id}>
                        <ContextMenuTrigger asChild disabled={l.imported}>
                          <li
                            onClick={() => setLastTouchedId(l.id)}
                            className={`flex items-center gap-3 px-3 py-2 transition-colors cursor-default ${
                              isLast ? 'bg-primary/5 ring-2 ring-primary ring-inset' : ''
                            } ${l.imported ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                          >
                            <span className="w-6 text-right text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate flex items-center gap-2">
                                {l.product_name}
                                {l.imported && (
                                  <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-700 dark:text-amber-400 shrink-0">
                                    IMPORTADO
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                R$ {l.effective_unit_price.toFixed(3).replace('.', ',')} × {l.quantity} {l.unit}
                                {l.effective_unit_price !== l.unit_price && (
                                  <span className="ml-1 line-through opacity-60">
                                    (R$ {l.unit_price.toFixed(3).replace('.', ',')})
                                  </span>
                                )}
                              </p>
                              {l.imported_notes && (
                                <p className="text-[11px] text-muted-foreground italic truncate">
                                  {l.imported_notes}
                                </p>
                              )}
                              {hasAdjust && (
                                <p className="text-[11px] tabular-nums mt-0.5 flex flex-wrap gap-2">
                                  {l.line_discount > 0 && (
                                    <span className="text-rose-500">
                                      − {formatPrice(l.line_discount)} desc.
                                    </span>
                                  )}
                                  {l.line_surcharge > 0 && (
                                    <span className="text-muted-foreground font-medium">
                                      + {formatPrice(l.line_surcharge)} acr.
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                            {l.imported ? (
                              <div className="flex items-center px-2">
                                <span className="w-16 text-center text-sm tabular-nums font-medium text-muted-foreground">
                                  {l.quantity} {l.unit}
                                </span>
                              </div>
                            ) : (
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
                            )}
                            <span className="w-24 text-right tabular-nums text-sm font-semibold text-emerald-600">
                              {formatPrice(lineTotal).replace('.', ',')}
                            </span>
                            {l.imported ? (
                              <span className="h-7 w-7" aria-hidden />
                            ) : (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => requestRemoveLine(l)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </li>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-64">
                          <ContextMenuItem
                            disabled={!pdvSettings.allow_price_change_on_sale}
                            onSelect={() => {
                              if (!pdvSettings.allow_price_change_on_sale) return;
                              setLastTouchedId(l.id);
                              setPriceTarget(l);
                            }}
                            className="flex items-center justify-between gap-4"
                          >
                            <span className="flex items-center gap-2">
                              <Tag className="h-4 w-4" />
                              Alterar preço
                            </span>
                            <kbd className="px-1.5 py-0.5 border rounded text-[10px] bg-muted">Home</kbd>
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => {
                              setLastTouchedId(l.id);
                              setDetailsTarget(l);
                            }}
                            className="flex items-center justify-between gap-4"
                          >
                            <span className="flex items-center gap-2">
                              <MoreHorizontal className="h-4 w-4" />
                              Editar detalhes
                            </span>
                            <kbd className="px-1.5 py-0.5 border rounded text-[10px] bg-muted">Ctrl+D</kbd>
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>

            {/* Painel inferior: TOTAL + Finalizar + Cancelar (fluxo vertical, sem coluna lateral) */}
            <div className="rounded-md border bg-card shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-4xl font-bold tabular-nums text-emerald-600 leading-tight">
                  {formatPrice(total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14"
                  onClick={() => {
                    if (lines.length > 0) setConfirmCancel(true);
                  }}
                  disabled={lines.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cancelar venda (Esc)
                </Button>
                <Button
                  size="lg"
                  className="h-14 text-lg px-8 sm:min-w-[260px]"
                  onClick={tryOpenPayment}
                  disabled={lines.length === 0 || !currentRegister}
                >
                  Finalizar (F2)
                </Button>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <p>Dica: digite <code>3*7891234567890</code> para adicionar 3 unidades.</p>
              <p>Atalhos no checkout: <kbd className="px-1 border rounded text-[10px]">A–Z</kbd> foca forma, <kbd className="px-1 border rounded text-[10px]">Home</kbd> desconto/acréscimo.</p>
            </div>
          </div>
        </div>

        {/* Diálogo de pagamento — tela "Finalizando venda" estilo Gweb */}
        <FrenteCaixaCheckoutDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          companyId={company?.id}
          defaultFiscalMode={pdvSettings.default_fiscal_mode}
          items={lines.map((l) => ({
            product_id: l.product_id,
            product_name: l.product_name,
            quantity: l.quantity,
            unit_price: Math.max(
              0,
              (l.effective_unit_price * l.quantity - l.line_discount + l.line_surcharge) /
                Math.max(l.quantity, 0.0001),
            ),
          }))}
          itemsTotal={total}
          onConfirm={handleConfirmPayment}
        />

        <FrenteCaixaPriceDialog
          open={!!priceTarget}
          onOpenChange={(o) => !o && setPriceTarget(null)}
          productName={priceTarget?.product_name ?? ''}
          initialUnitPrice={priceTarget?.effective_unit_price ?? 0}
          quantity={priceTarget?.quantity ?? 1}
          onConfirm={(change) => {
            if (priceTarget) applyPriceChange(priceTarget, change);
            setPriceTarget(null);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />

        <FrenteCaixaItemDetailsDialog
          open={!!detailsTarget}
          onOpenChange={(o) => !o && setDetailsTarget(null)}
          code={detailsTarget ? productCode(detailsTarget) : ''}
          productName={detailsTarget?.product_name ?? ''}
          unit={detailsTarget?.unit ?? 'UN'}
          initialQuantity={detailsTarget?.quantity ?? 1}
          initialUnitPrice={detailsTarget?.effective_unit_price ?? 0}
          initialDiscount={detailsTarget?.line_discount ?? 0}
          onConfirm={(r) => {
            if (detailsTarget) applyDetailsChange(detailsTarget, r);
            setDetailsTarget(null);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onRemove={() => {
            if (detailsTarget) {
              setLines((prev) => prev.filter((l) => l.id !== detailsTarget.id));
              setLastTouchedId(null);
            }
            setDetailsTarget(null);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
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
                  setImportedOrderId(null);
                  setImportedLabel(null);
                  setConfirmCancel(false);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                Cancelar venda
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!removeTarget}
          onOpenChange={(o) => {
            if (!o) {
              setRemoveTarget(null);
              setRemoveQty('1');
            }
          }}
        >
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl">Remover item</AlertDialogTitle>
            </AlertDialogHeader>
            {removeTarget && (() => {
              const idx = lines.findIndex((l) => l.id === removeTarget.id) + 1;
              const prod = products.find((p) => p.id === removeTarget.product_id) as any;
              const codigo =
                (prod?.gtin || prod?.code || prod?.sku || removeTarget.product_id || '—')
                  .toString();
              return (
                <div className="space-y-5 py-2">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Item *</div>
                      <div className="text-lg border-b border-border pb-1">{idx}</div>
                      <div className="pt-1">
                        <kbd className="px-2 py-0.5 border rounded text-[10px] bg-muted">F2</kbd>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Código *</div>
                      <div className="text-lg border-b border-border pb-1 truncate">{codigo}</div>
                      <div className="pt-1">
                        <kbd className="px-2 py-0.5 border rounded text-[10px] bg-muted">F3</kbd>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm">Item:</div>
                    <div className="text-base font-bold uppercase">
                      {removeTarget.product_name}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm">Qtd. vendida:</div>
                    <div className="text-base font-bold">
                      {removeTarget.quantity} {removeTarget.unit || 'UN'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Quantidade a ser removida</div>
                    <Input
                      type="number"
                      min={1}
                      max={removeTarget.quantity}
                      value={removeQty}
                      onChange={(e) => setRemoveQty(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmRemoveQty();
                        }
                      }}
                      autoFocus
                      className="h-10 text-base"
                    />
                    <div className="pt-1">
                      <kbd className="px-2 py-0.5 border rounded text-[10px] bg-muted">F4</kbd>
                    </div>
                  </div>
                </div>
              );
            })()}
            <AlertDialogFooter>
              <AlertDialogCancel className="uppercase">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmRemoveQty} className="uppercase">
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmação ao remover/zerar uma linha do carrinho */}
        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deseja realmente excluir esse item?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDelete ? (
                  <>O item <strong className="uppercase">{confirmDelete.product_name}</strong> será removido do carrinho.</>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmDelete) {
                    const id = confirmDelete.id;
                    setLines((prev) => prev.filter((l) => l.id !== id));
                    setLastTouchedId((curr) => (curr === id ? null : curr));
                  }
                  setConfirmDelete(null);
                }}
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bloqueio de navegação interna quando há venda em andamento */}
        <AlertDialog
          open={!!pendingNavPath}
          onOpenChange={(o) => {
            if (!o) setPendingNavPath(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Quer sair desta tela?</AlertDialogTitle>
              <AlertDialogDescription>
                É possível que as alterações não tenham sido efetuadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() => {
                  const path = pendingNavPath;
                  setPendingNavPath(null);
                  suppressBeforeUnloadRef.current = true;
                  if (path) navigate(path);
                }}
              >
                Sair
              </AlertDialogAction>
              <AlertDialogCancel onClick={() => setPendingNavPath(null)}>
                Cancelar
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmação customizada para F5 / Ctrl+R / Cmd+R */}
        <AlertDialog
          open={confirmReload}
          onOpenChange={(o) => { if (!o) setConfirmReload(false); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Quer atualizar o site?</AlertDialogTitle>
              <AlertDialogDescription>
                É possível que as alterações não tenham sido efetuadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() => {
                  suppressBeforeUnloadRef.current = true;
                  window.location.reload();
                }}
              >
                Recarregar
              </AlertDialogAction>
              <AlertDialogCancel onClick={() => setConfirmReload(false)}>
                Cancelar
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FrenteCaixaCashMovementDialog
          open={cashMovementOpen !== null}
          type={cashMovementOpen ?? 'sangria'}
          companyId={company?.id}
          cashRegisterId={currentRegister?.id}
          userId={user?.id}
          requireReason={pdvSettings.require_movement_reason}
          onOpenChange={(o) => {
            if (!o) setCashMovementOpen(null);
          }}
          onDone={() => setTimeout(() => inputRef.current?.focus(), 50)}
        />

        <FrenteCaixaInutilizarNfceDialog
          open={inutOpen}
          companyId={company?.id}
          onOpenChange={setInutOpen}
        />

        {company?.id && (
          <FrenteCaixaXmlMesDialog
            open={xmlMesOpen}
            onOpenChange={setXmlMesOpen}
            companyId={company.id}
            companyName={company.name}
          />
        )}

        {/* Rail lateral (estilo Gweb) — abre/fecha pela setinha »/« ou F10 */}
        <FrenteCaixaActionsMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onSangria={() => setCashMovementOpen('sangria')}
          onSuprimento={() => setCashMovementOpen('suprimento')}
          onInutilizarNfce={() => setInutOpen(true)}
          onXmlMes={() => setXmlMesOpen(true)}
          onRelFechamento={handleRelFechamento}
          onImportPedido={
            cardapioModuleEnabled ? () => setImportDialog('pedido') : undefined
          }
          onImportMesa={
            mesaQrModuleEnabled ? () => setImportDialog('mesa') : undefined
          }
        />

        <FrenteCaixaImportDialog
          open={importDialog !== null}
          onOpenChange={(o) => !o && setImportDialog(null)}
          companyId={company?.id}
          type={importDialog ?? 'pedido'}
          onImport={handleImportOrder}
        />

        {/* FAB vermelho — atalho contextual (foca scanner ou abre pagamento) */}
        <button
          type="button"
          onClick={() => {
            if (lines.length > 0) tryOpenPayment();
            else inputRef.current?.focus();
          }}
          title={lines.length > 0 ? 'Finalizar venda' : 'Focar scanner'}
          aria-label="Ação rápida"
          className={`fixed bottom-5 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-all flex items-center justify-center ${
            menuOpen ? 'right-[336px]' : 'right-5'
          }`}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Dialog — Abrir Caixa direto pelo Frente de Caixa.
          Reaproveita exatamente o mesmo `openRegister` do PDV V2 e da tela de
          Caixas, garantindo um único caixa por loja (índice
          `cash_registers_one_open_per_company`). */}
      <Dialog open={openCashOpen} onOpenChange={setOpenCashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Caixa</DialogTitle>
            <DialogDescription>
              Informe o valor de abertura (troco inicial). Use 0 se não houver troco.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="fc-opening-amount">Valor de abertura (R$)</Label>
            <Input
              id="fc-opening-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0,00"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCashOpen(false)} disabled={isOpening}>
              Cancelar
            </Button>
            <Button
              disabled={isOpening}
              onClick={async () => {
                if (!user) return;
                const amount = parseFloat(openingAmount.replace(',', '.')) || 0;
                const ok = await openRegister(amount, user.id);
                if (ok) {
                  setOpenCashOpen(false);
                  setOpeningAmount('');
                }
              }}
            >
              {isOpening ? 'Abrindo...' : 'Abrir Caixa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PDVV2Layout>
  );
}