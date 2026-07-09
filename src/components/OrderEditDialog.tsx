import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, ArrowLeftRight, Search, Bike, Store, CreditCard, MapPin, UserPlus, AlertTriangle } from 'lucide-react';
import { Order, OrderItem } from '@/types/order';
import { Product } from '@/types/product';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { useCategories } from '@/hooks/useCategories';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useDeliveryNeighborhoods } from '@/hooks/useDeliveryNeighborhoods';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PDVV2CategoryBrowser } from '@/components/pdv-v2/PDVV2CategoryBrowser';
import { PDVOptionalsDialog } from '@/components/pdv/PDVOptionalsDialog';
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { computeReadyOffsetMinutes } from '@/utils/estimatedReadyOffset';
import { stripDescMarkers, extractPaymentName } from '@/utils/orderNotesDisplay';
import { cn } from '@/lib/utils';
import { useCustomerAddresses, CustomerAddress } from '@/hooks/useCustomerAddresses';
import { CustomerAddressPicker } from '@/components/menu/CustomerAddressPicker';
import { FrenteCaixaCustomerDialog } from '@/components/frente-caixa/FrenteCaixaCustomerDialog';

interface OrderEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
  companyId: string;
  storeName?: string;
  paperSize?: '58mm' | '80mm';
  /** Callback após salvar com sucesso para refetch imediato. */
  onSaved?: () => void;
}

type WorkingItem = OrderItem & {
  /** id existente no banco, se houver (itens novos não têm). */
  dbId?: string;
  /** Marcações apenas para a sessão de edição. */
  isNew?: boolean;
  swappedFrom?: string;
  /** Para itens novos / trocados, guardamos o productId selecionado para FK. */
  pendingProductId?: string;
};

function cleanProductName(name: string): string {
  if (name.includes('(') && name.endsWith(')')) {
    return name.substring(0, name.indexOf('(')).trim();
  }
  return name;
}

export function OrderEditDialog({
  open,
  onOpenChange,
  order,
  companyId,
  storeName = 'Comanda Tech',
  paperSize = '80mm',
  onSaved,
}: OrderEditDialogProps) {
  const { products } = useProducts({ companyId });
  const { groups: optionalGroups } = useOptionalGroups({ companyId });
  const { categories } = useCategories({ companyId });
  const { settings: storeSettings } = useStoreSettings({ companyId });
  const { neighborhoods } = useDeliveryNeighborhoods({ companyId });
  const { activePaymentMethods } = usePaymentMethods({ companyId });
  const [working, setWorking] = useState<WorkingItem[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Picker state
  const [pickerMode, setPickerMode] = useState<null | { type: 'add' } | { type: 'swap'; targetIndex: number }>(null);
  const [search, setSearch] = useState('');
  // Produto escolhido no browser (fluxo "Adicionar item") aguardando seleção de adicionais.
  const [optionalsProduct, setOptionalsProduct] = useState<Product | null>(null);

  // --- NOVO (v1.16): edição de Entrega e Forma de Pagamento ---
  // Modalidade atual derivada do pedido original.
  const originalModality: 'pickup' | 'delivery' = order.deliveryAddress ? 'delivery' : 'pickup';
  const [modality, setModality] = useState<'pickup' | 'delivery'>(originalModality);
  // Endereço estruturado (mesmo padrão do cardápio).
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  // Opção de entrega (mirror MenuV2): pickup | city | interior | neighborhood.
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'city' | 'interior' | 'neighborhood'>('pickup');
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState<string>('');
  // Cliente resolvido a partir do telefone (para carregar endereços salvos).
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | null>(null);
  const [resolvedCustomerName, setResolvedCustomerName] = useState<string>('');
  const [resolvedCustomerPhone, setResolvedCustomerPhone] = useState<string>('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  // Endereços salvos do cliente.
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [newAddrOpen, setNewAddrOpen] = useState(false);
  const [newAddrForm, setNewAddrForm] = useState({
    label: '', address: '', number: '', complement: '', neighborhood: '', reference: '',
  });
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [changeFor, setChangeFor] = useState<string>('');

  // Hidrata estado de trabalho ao abrir
  useEffect(() => {
    if (!open) return;
    const items: WorkingItem[] = order.items.map((it) => ({ ...it, dbId: it.id }));
    setWorking(items);
    setOriginalIds(new Set(order.items.map((i) => i.id)));
    setPickerMode(null);
    setSearch('');
    setOptionalsProduct(null);
    // Reset Entrega/Pagamento ao abrir
    setModality(order.deliveryAddress ? 'delivery' : 'pickup');
    // Parse best-effort do endereço original: "Logradouro, Número - Complemento - Bairro | Ref: X"
    const raw = (order.deliveryAddress || '').trim();
    let addr = '', num = '', comp = '', bairro = '', ref = '';
    if (raw) {
      const refM = raw.match(/\|\s*Ref[^:]*:\s*(.+)$/i);
      const base = refM ? raw.slice(0, refM.index).trim() : raw;
      if (refM) ref = refM[1].trim();
      // Split por " - "
      const parts = base.split(/\s+-\s+/);
      // parts[0] = "Logradouro, Número"
      if (parts[0]) {
        const m = parts[0].match(/^(.*?),\s*([^,]+)$/);
        if (m) { addr = m[1].trim(); num = m[2].trim(); } else { addr = parts[0].trim(); }
      }
      if (parts.length >= 3) { comp = parts[1].trim(); bairro = parts.slice(2).join(' - ').trim(); }
      else if (parts.length === 2) { bairro = parts[1].trim(); }
    }
    setDeliveryAddress(addr);
    setDeliveryNumber(num);
    setDeliveryComplement(comp);
    setDeliveryNeighborhood(bairro);
    setDeliveryReference(ref);
    setSelectedNeighborhoodId('');
    setSelectedAddressId(null);
    setNewAddrOpen(false);
    setCustomerPickerOpen(false);
    // Cliente inicial vindo do pedido
    setResolvedCustomerName(order.customerName || '');
    setResolvedCustomerPhone(order.customerPhone || '');
    setResolvedCustomerId(null);
    // Tenta detectar o "troco para" das notes originais.
    const trocoM = (order.notes || '').match(/Troco para R\$\s*([^)]+)/i);
    setChangeFor(trocoM ? trocoM[1].trim() : '');
    setPaymentMethodId('');
  }, [open, order.items, order.deliveryAddress, order.notes, order.customerName, order.customerPhone]);

  // Inicializa a OPÇÃO de entrega ao abrir e quando storeSettings/neighborhoods chegam.
  useEffect(() => {
    if (!open) return;
    if (originalModality === 'pickup') { setDeliveryOption('pickup'); return; }
    if (storeSettings.deliveryMode === 'neighborhood') {
      setDeliveryOption('neighborhood');
    } else {
      // Modo simples: preferir cidade se habilitada, senão interior.
      if (storeSettings.deliveryFeeCityEnabled !== false) setDeliveryOption('city');
      else if (storeSettings.deliveryFeeInteriorEnabled !== false) setDeliveryOption('interior');
      else setDeliveryOption('city');
    }
  }, [open, originalModality, storeSettings.deliveryMode, storeSettings.deliveryFeeCityEnabled, storeSettings.deliveryFeeInteriorEnabled]);

  // Segue a modalidade: retirada zera opção; entrega volta pra padrão.
  useEffect(() => {
    if (!open) return;
    if (modality === 'pickup') {
      setDeliveryOption('pickup');
      return;
    }
    if (deliveryOption === 'pickup') {
      if (storeSettings.deliveryMode === 'neighborhood') setDeliveryOption('neighborhood');
      else setDeliveryOption('city');
    }
  }, [modality, open, storeSettings.deliveryMode, deliveryOption]);

  // Resolve customer_id pelo telefone do pedido (para carregar endereços salvos).
  useEffect(() => {
    if (!open) return;
    const phone = (resolvedCustomerPhone || '').replace(/\D/g, '');
    const isClienteLoja = (resolvedCustomerName || '').trim().toLowerCase() === 'cliente loja';
    if (!phone || isClienteLoja) { setResolvedCustomerId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('company_id', companyId)
          .eq('phone', phone)
          .maybeSingle();
        if (!cancelled) setResolvedCustomerId(data?.id ?? null);
      } catch { if (!cancelled) setResolvedCustomerId(null); }
    })();
    return () => { cancelled = true; };
  }, [open, resolvedCustomerPhone, resolvedCustomerName, companyId]);

  // Endereços salvos do cliente.
  const {
    addresses: customerAddresses,
    create: createCustomerAddress,
    setDefault: setCustomerAddressDefault,
    remove: removeCustomerAddress,
  } = useCustomerAddresses(resolvedCustomerId, companyId);

  const isClienteLoja = useMemo(
    () => (resolvedCustomerName || '').trim().toLowerCase() === 'cliente loja',
    [resolvedCustomerName],
  );
  const requiresCustomerSelection = modality === 'delivery' && (isClienteLoja || !resolvedCustomerPhone);

  // Pré-seleciona método de pagamento atual quando a lista chega.
  useEffect(() => {
    if (!open) return;
    if (paymentMethodId) return;
    const current = extractPaymentName(order.notes);
    if (!current) return;
    const match = activePaymentMethods.find(
      (m) => m.name.trim().toLowerCase() === current.trim().toLowerCase(),
    );
    if (match) setPaymentMethodId(match.id);
  }, [open, activePaymentMethods, order.notes, paymentMethodId]);

  const newTotal = useMemo(
    () => working.reduce((s, it) => s + it.price * it.quantity, 0),
    [working],
  );
  const subtotalOriginal = useMemo(
    () => order.items.reduce((s, it) => s + it.price * it.quantity, 0),
    [order.items],
  );
  // Taxa de entrega ORIGINAL preservada (derivada por diferença).
  const originalDeliveryFee = Math.max(0, order.total - subtotalOriginal);

  // Nova taxa de entrega conforme opção escolhida no diálogo (mirror MenuV2).
  const newDeliveryFee = useMemo(() => {
    if (modality === 'pickup' || deliveryOption === 'pickup') return 0;
    if (deliveryOption === 'city') return storeSettings.deliveryFeeCity || 0;
    if (deliveryOption === 'interior') return storeSettings.deliveryFeeInterior || 0;
    if (deliveryOption === 'neighborhood') {
      const n = neighborhoods.find((x) => x.id === selectedNeighborhoodId);
      // Sem bairro selecionado ou bairro não atendido → zera taxa (decisão do usuário).
      return n?.deliveryFee || 0;
    }
    return 0;
  }, [modality, deliveryOption, selectedNeighborhoodId, neighborhoods, storeSettings]);

  const newGrandTotal = newTotal + newDeliveryFee;
  const diff = newGrandTotal - order.total;

  // Detecta mudanças efetivas em Entrega/Pagamento (sem disparar reimpressão à toa).
  const newPaymentName = useMemo(
    () => activePaymentMethods.find((p) => p.id === paymentMethodId)?.name || '',
    [activePaymentMethods, paymentMethodId],
  );
  const originalPaymentName = useMemo(
    () => (extractPaymentName(order.notes) || '').trim(),
    [order.notes],
  );
  const originalTroco = useMemo(() => {
    const m = (order.notes || '').match(/Troco para R\$\s*([^)]+)/i);
    return m ? m[1].trim() : '';
  }, [order.notes]);

  const modalityChanged =
    modality !== originalModality ||
    (modality === 'delivery' && buildFinalDeliveryAddress() !== (order.deliveryAddress || null)) ||
    Math.abs(newDeliveryFee - originalDeliveryFee) > 0.001 ||
    (modality === 'delivery' && !!selectedNeighborhoodId);
  const paymentChanged =
    !!newPaymentName &&
    (newPaymentName.trim().toLowerCase() !== originalPaymentName.toLowerCase() ||
      (/dinheiro/i.test(newPaymentName) && changeFor.trim() !== originalTroco));

  const isMoneyPayment = /dinheiro/i.test(newPaymentName);
  const isPixPayment = /pix/i.test(newPaymentName);
  const selectedPixKey = activePaymentMethods.find((p) => p.id === paymentMethodId)?.pix_key || '';

  // Endereço final que será gravado (mesmo formato do cardápio).
  function buildFinalDeliveryAddress(): string | null {
    if (modality === 'pickup') return null;
    const addr = deliveryAddress.trim();
    if (!addr) return null;
    const num = deliveryNumber.trim();
    const comp = deliveryComplement.trim();
    const bairro = deliveryNeighborhood.trim();
    const ref = deliveryReference.trim();
    let s = num ? `${addr}, ${num}` : addr;
    if (comp) s += ` - ${comp}`;
    if (bairro) s += ` - ${bairro}`;
    if (ref) s += ` | Ref: ${ref}`;
    return s;
  }

  // Reescreve `notes` substituindo o bloco "Pagamento: ..." quando houve troca.
  function rebuildNotesWithPayment(orig: string | null | undefined): string {
    let cleaned = orig || '';
    if (paymentChanged) {
      // Remove TODOS os blocos antigos de "Pagamento: ..." (com ou sem parênteses)
      cleaned = cleaned
        .replace(/\[COBRADO\]\s*/gi, '')
        .replace(/Pagamento:\s*[^|\[]*?(?:\s*\([^)]*\))?(?=\s*\||\s*\[|$)/gi, '')
        .replace(/\s*\|\s*\|\s*/g, ' | ')
        .replace(/^\s*\|\s*/, '')
        .replace(/\s*\|\s*$/, '')
        .trim();
      let block = `Pagamento: ${newPaymentName}`;
      if (isMoneyPayment && changeFor.trim()) {
        block += ` (Troco para R$ ${changeFor.trim()})`;
      } else if (isPixPayment && selectedPixKey) {
        block += ` (Chave PIX: ${selectedPixKey})`;
      }
      cleaned = block + (cleaned ? ' | ' + cleaned : '');
    }
    return cleaned;
  }

  const swappableProducts = useMemo(() => products.filter((p) => p.active && p.swappableInOrder), [products]);
  const allActiveProducts = useMemo(() => products.filter((p) => p.active), [products]);

  // Mapa Nome de Categoria -> id, para resolver grupos do produto (mesmo padrão do Pedido Express).
  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  function getGroupsForProduct(productId: string, productCategory: string): OptionalGroup[] {
    const catId = categoryIdByName[productCategory];
    return optionalGroups
      .filter((g) => {
        if (!g.active) return false;
        if (g.waiterOnly) return false;
        if (g.productIds.includes(productId)) return true;
        if (catId && g.categoryIds.includes(catId)) return true;
        return false;
      })
      .map((g) => {
        const override = g.productOverrides?.find((o) => o.productId === productId);
        if (override && (override.minSelectOverride !== null || override.maxSelectOverride !== null)) {
          return {
            ...g,
            minSelect: override.minSelectOverride ?? g.minSelect,
            maxSelect: override.maxSelectOverride ?? g.maxSelect,
          };
        }
        return g;
      });
  }

  // Lista filtrada do picker
  const pickerProducts = useMemo(() => {
    if (!pickerMode) return [];
    const q = search.trim().toLowerCase();
    if (pickerMode.type === 'swap') {
      const target = working[pickerMode.targetIndex];
      const targetClean = cleanProductName(target.name);
      const original = products.find((p) => p.name === targetClean);
      const targetCategory = original?.category;
      let list = swappableProducts;
      if (targetCategory) list = list.filter((p) => p.category === targetCategory);
      if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
      return list;
    }
    let list = allActiveProducts;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [pickerMode, search, working, products, swappableProducts, allActiveProducts]);

  function handleAddItem(product: Product) {
    setWorking((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: product.id,
        name: product.name,
        quantity: 1,
        price: product.price,
        notes: undefined,
        isNew: true,
        pendingProductId: product.id,
      },
    ]);
    setPickerMode(null);
    setSearch('');
  }

  /**
   * Handler para o browser de categorias (mesmo padrão do Pedido Express):
   * se o produto tem grupos de adicionais → abre PDVOptionalsDialog;
   * caso contrário → adiciona direto como nova linha.
   */
  function handleProductFromBrowser(product: Product) {
    const groups = getGroupsForProduct(product.id, product.category);
    if (groups.length > 0) {
      setOptionalsProduct(product);
      return;
    }
    handleAddItem(product);
  }

  /** Recebe os itens montados pelo PDVOptionalsDialog (já com nome composto + preço unitário). */
  function handleAddFromOptionals(items: Array<{ product_id: string | null; product_name: string; quantity: number; unit_price: number; }>) {
    if (!items.length) return;
    setWorking((prev) => {
      const next = [...prev];
      for (const it of items) {
        next.push({
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          productId: it.product_id || '',
          name: it.product_name,
          quantity: it.quantity,
          price: it.unit_price,
          notes: undefined,
          isNew: true,
          pendingProductId: it.product_id || undefined,
        });
      }
      return next;
    });
    setOptionalsProduct(null);
    setPickerMode(null);
    setSearch('');
  }

  function handleSwapItem(product: Product) {
    if (!pickerMode || pickerMode.type !== 'swap') return;
    const idx = pickerMode.targetIndex;
    setWorking((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const originalName = it.swappedFrom || cleanProductName(it.name);
        return {
          ...it,
          productId: product.id,
          pendingProductId: product.id,
          name: product.name,
          price: product.price,
          notes: undefined,
          swappedFrom: originalName,
        };
      }),
    );
    setPickerMode(null);
    setSearch('');
  }

  // Verifica se o item original (do banco) é trocável.
  function isItemSwappable(it: WorkingItem): boolean {
    const cleanName = cleanProductName(it.name);
    const prod = products.find((p) => p.id === it.productId || p.name === cleanName);
    if (it.isNew) return false; // recém-adicionado, não tem sentido trocar
    if (it.swappedFrom) {
      // já trocado nessa sessão — permitir trocar de novo
      return true;
    }
    return !!prod?.swappableInOrder;
  }

  function buildDeltaProductionHtml(
    addedOrSwapped: WorkingItem[],
    removedSwaps: { from: string; to: string }[],
  ): string {
    // Reformata o nome composto "Produto (Adicionais: a, b)" para alimentar o
    // parser do layout v2 (que renderiza ">> ADICIONAL"), e injeta a tag
    // [ADICIONADO] / [TROCADO de: X] como observação destacada.
    const items = addedOrSwapped.map((it) => {
      const cleanName = cleanProductName(it.name);
      const adicionaisRaw = it.name.includes('(') && it.name.endsWith(')')
        ? it.name.substring(it.name.indexOf('(') + 1, it.name.length - 1).trim()
        : '';
      const obsTag = it.swappedFrom
        ? `TROCADO de: ${it.swappedFrom}`
        : 'ITEM ADICIONADO';
      // Layout v2 espera "Adicionais: a, b, c | obs"
      const noteParts: string[] = [];
      if (adicionaisRaw) {
        if (/^Adicionais?:/i.test(adicionaisRaw)) {
          noteParts.push(adicionaisRaw);
        } else {
          noteParts.push(`Adicionais: ${adicionaisRaw}`);
        }
      }
      noteParts.push(obsTag);
      return {
        productName: cleanName,
        quantity: it.quantity,
        notes: noteParts.join(' | '),
      };
    });
    const readyOffset = computeReadyOffsetMinutes(storeSettings.estimatedWaitTime);
    return generateProductionTicketHTML({
      tabNumber: order.dailyNumber,
      customerName: order.customerName,
      items,
      createdAt: new Date(),
      paperSize,
      referenceLabel: `ALTERAÇÃO PEDIDO ${order.shortCode || '#' + (order.orderCode || order.dailyNumber)}`,
      layout: storeSettings.printLayout,
      orderType: order.origin === 'mesa'
        ? 'table'
        : order.deliveryAddress
          ? 'delivery'
          : 'pickup',
      showReadyTime: storeSettings.printLayout === 'v2' || storeSettings.printLayout === 'v3',
      readyOffsetMinutes: readyOffset,
    });
  }

  function buildUpdatedReceiptHtml(
    items: WorkingItem[],
    overrides?: {
      deliveryAddress?: string | null;
      notes?: string | null;
      deliveryFee?: number;
    },
  ): string {
    // Mirror do template do auto_printer.py (formatar_recibo_html), com o
    // mesmo HTML/markup esperado pelo GDI: <!--BOX_START-->/<!--BOX_END-->,
    // .item-name, .additionals/.add-line, .obs, .delivery-badge,
    // payment block, "Obrigado pela preferencia!".
    const effectiveDeliveryFee =
      overrides?.deliveryFee !== undefined ? overrides.deliveryFee : originalDeliveryFee;
    const effectiveDeliveryAddress =
      overrides && 'deliveryAddress' in overrides
        ? overrides.deliveryAddress
        : order.deliveryAddress;
    const effectiveNotes =
      overrides && 'notes' in overrides ? overrides.notes : order.notes;
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const total = subtotal + effectiveDeliveryFee;
    const fontSize = paperSize === '80mm' ? '11pt' : '10pt';
    const dt = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const orderNum = order.orderCode || order.dailyNumber;

    // V2 (recibo editado): rótulo de grupo com ■ sublinhado, endereço
    // invertido e adicionais com valor. Ativo para todas as lojas com
    // layout V2 marcado. auto_printer.py v8.34+ interpreta os markers.
    const isI9 = storeSettings?.printLayout === 'v2';

    // Origem do pedido — mesmo critério do auto_printer.py
    const notesRaw = effectiveNotes || '';
    const isExpressNote = notesRaw.includes('[EXPRESS]');
    const source = (order as any).source || '';
    let origemLabel = '📱 CARDÁPIO ONLINE';
    if (source === 'express' || isExpressNote) origemLabel = '⚡ PEDIDO EXPRESS';
    else if (source === 'waiter') origemLabel = '🍽️ PEDIDO GARÇOM';
    origemLabel += ' — EDITADO';

    // Pagamento / troco / pix a partir das notes
    let paymentHtml = '';
    if (notesRaw) {
      const payMatch = notesRaw.match(/Pagamento:\s*([^(|]+)/i);
      const trocoMatch = notesRaw.match(/Troco para R\$\s*([^)]+)/i);
      const pixMatch = notesRaw.match(/Chave PIX:\s*([^)]+)\)/i);
      if (payMatch) paymentHtml += `<p><span class="label">PAGAMENTO:</span> ${payMatch[1].trim()}</p>`;
      if (trocoMatch) paymentHtml += `<p><span class="label">TROCO PARA:</span> R$ ${trocoMatch[1].trim()}</p>`;
      if (pixMatch) paymentHtml += `<p><span class="label">CHAVE PIX:</span> ${pixMatch[1].trim()}</p>`;
    }
    if (!paymentHtml) {
      const fallback = extractPaymentName(effectiveNotes);
      if (fallback) paymentHtml = `<p><span class="label">PAGAMENTO:</span> ${fallback}</p>`;
    }

    // Bloco entrega / retirada
    const deliverySection = effectiveDeliveryAddress
      ? (isI9
          ? `<div class="delivery-badge">ENTREGA</div>
         <div class="section"><p>[ENDERECO]${effectiveDeliveryAddress}[/ENDERECO]</p></div>`
          : `<div class="delivery-badge">ENTREGA</div>
         <div class="section"><p>${effectiveDeliveryAddress}</p></div>`)
      : '<div class="delivery-badge">RETIRADA NO LOCAL</div>';

    // Itens — usando mesmo markup do auto_printer.py
    const itemsHtml = items.map((it, idx) => {
      const qtd = it.quantity;
      const cleanName = cleanProductName(it.name);
      // Extrai adicionais. I9: preserva grupos (rótulo ■ sublinhado quando 2+).
      let adicionais: string[] = [];
      let grupos: { nome: string; itens: string[] }[] = [];
      if (it.name.includes('(') && it.name.endsWith(')')) {
        const inside = it.name.substring(it.name.indexOf('(') + 1, it.name.length - 1).trim();
        const m = inside.match(/^Adicionais?:\s*(.+)$/i);
        if (m) {
          adicionais = m[1].split(',').map(s => s.trim()).filter(Boolean);
          if (isI9 && adicionais.length > 0) {
            grupos.push({ nome: 'Adicionais', itens: adicionais.slice() });
          }
        } else {
          const partes = inside.split('|').map(s => s.trim()).filter(Boolean);
          for (const g of partes) {
            const hasColon = g.includes(':');
            const nome = hasColon ? g.split(':')[0].trim() : 'Adicionais';
            const after = hasColon ? g.split(':').slice(1).join(':') : g;
            const itens = after.split(',').map(p => p.trim()).filter(Boolean);
            itens.forEach(p => adicionais.push(p));
            if (isI9 && itens.length > 0) grupos.push({ nome, itens });
          }
        }
      }

      // Tag de edição vai como observação invertida
      const obsTag = it.isNew
        ? 'ITEM ADICIONADO'
        : it.swappedFrom
          ? `TROCADO de: ${it.swappedFrom}`
          : '';

      const lineTotal = (it.price * qtd).toFixed(2).replace('.', ',');
      let block = '<div class="item">\n';
      block += `  <div class="item-name">${qtd}x ${cleanName}</div>\n`;
      if (isI9 && grupos.length > 0) {
        block += '  <div class="additionals">\n';
        const single = grupos.length === 1;
        for (const g of grupos) {
          if (!single) {
            block += `    <div class="add-group-label">[ADDGROUP_LABEL]${g.nome}[/ADDGROUP_LABEL]</div>\n`;
          }
          for (const ad of g.itens) {
            const mPrice = ad.match(/\s*R\$\s*([\d.,]+)\s*$/);
            const adClean = ad.replace(/\s*R\$\s*[\d.,]+\s*$/, '').trim();
            if (adClean) {
              const priceSuffix = mPrice ? `  R$ ${mPrice[1]}` : '';
              block += `    <div class="add-line">+ ${adClean.toUpperCase()}${priceSuffix}</div>\n`;
            }
          }
        }
        block += '  </div>\n';
      } else if (adicionais.length > 0) {
        block += '  <div class="additionals">\n';
        for (const ad of adicionais) {
          const mPrice = ad.match(/\s*R\$\s*([\d.,]+)\s*$/);
          const adClean = ad.replace(/\s*R\$\s*[\d.,]+\s*$/, '').trim();
          if (adClean) {
            const priceSuffix = mPrice ? `  R$ ${mPrice[1]}` : '';
            block += `    <div class="add-line">+ ${adClean.toUpperCase()}${priceSuffix}</div>\n`;
          }
        }
        block += '  </div>\n';
      }
      if (obsTag) {
        block += `  <div class="obs-block"><span class="obs">${obsTag}</span></div>\n`;
      }
      block += `  <div class="item-detail">R$ ${lineTotal}</div>\n`;
      block += '</div>\n';
      if (idx < items.length - 1) {
        block += '<div class="item-sep">................................</div>\n';
      }
      return block;
    }).join('');

    const subtotalStr = subtotal.toFixed(2).replace('.', ',');
    const totalStr = total.toFixed(2).replace('.', ',');
    const deliveryFeeHtml = effectiveDeliveryFee > 0
      ? `<div class="total-line"><span>Entrega:</span><span>R$ ${effectiveDeliveryFee.toFixed(2).replace('.', ',')}</span></div>`
      : '';
    const phoneHtml = order.customerPhone
      ? `<p><span class="label">Tel:</span> ${order.customerPhone}</p>`
      : '';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pedido EDITADO #${orderNum}</title>
    <style>
        @page { margin: 0; size: ${paperSize} auto; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', 'Lucida Console', monospace;
            font-size: ${fontSize};
            font-weight: bold;
            width: ${paperSize};
            max-width: ${paperSize};
            padding: 2mm;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
        }
        .center { text-align: center; }
        .header { text-align: center; margin-bottom: 2mm; }
        .store-name { font-size: 12pt; font-weight: bold; }
        .order-num { font-size: 16pt; font-weight: bold; margin: 1mm 0; }
        .origem { font-size: 9pt; font-weight: bold; margin: 0.5mm 0; }
        .date { font-size: 8pt; }
        .divider { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
        .label { font-size: 9pt; font-weight: bold; }
        .section { margin: 1mm 0; }
        .section p { margin: 0.5mm 0; font-size: 10pt; }
        .item { margin: 1.5mm 0; }
        .item-name { font-size: 11pt; font-weight: bold; text-transform: uppercase; }
        .item-detail { font-size: 9pt; margin-left: 2mm; }
        .item-sep { font-size: 10pt; line-height: 1; margin: 1mm 0; }
        .additionals { margin: 1mm 0 0 2mm; }
        .add-line { font-size: 11pt; font-weight: 900; line-height: 1.4; word-break: break-word; text-transform: uppercase; }
        .obs-block { margin: 1mm 0 0 2mm; }
        .obs { display: inline-block; background: #000 !important; color: #fff !important; padding: 0.5mm 2mm; font-weight: bold; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .total-line { display: flex; justify-content: space-between; font-size: 10pt; margin: 0.5mm 0; }
        .grand-total { display: flex; justify-content: space-between; font-size: 13pt; font-weight: bold; margin: 1mm 0; }
        .footer { text-align: center; font-size: 8pt; margin-top: 2mm; }
        .delivery-badge { text-align: center; font-size: 11pt; font-weight: bold; padding: 1mm; margin: 1mm 0; border: 1px solid #000; }
    </style>
</head>
<body>
    <!--BOX_START-->
    <div class="header">
        <div class="store-name">${storeName.toUpperCase()}</div>
        <div class="order-num">PEDIDO #${orderNum}</div>
        <div class="origem">${origemLabel}</div>
        <div class="date">${dt}</div>
    </div>
    <hr class="divider">
    <div class="section">
        <p><span class="label">Cliente:</span> ${order.customerName}</p>
        ${phoneHtml}
        ${paymentHtml}
    </div>
    <!--BOX_END-->
    ${deliverySection}
    <hr class="divider">
    <div class="section">
        ${itemsHtml}
    </div>
    <hr class="divider">
    <div class="total-line">
        <span>Subtotal:</span>
        <span>R$ ${subtotalStr}</span>
    </div>
    ${deliveryFeeHtml}
    <div class="grand-total">
        <span>TOTAL:</span>
        <span>R$ ${totalStr}</span>
    </div>
    <hr class="divider">
    <p class="footer">Obrigado pela preferencia!</p>
</body>
</html>`;
  }

  async function sendWhatsAppNotification(items: WorkingItem[]): Promise<void> {
    if (!order.customerPhone) return;
    try {
      const { data: moduleData } = await supabase
        .from('company_modules')
        .select('enabled')
        .eq('company_id', companyId)
        .eq('module_name', 'whatsapp')
        .maybeSingle();
      if (!moduleData?.enabled) return;

      const { data: instanceData } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, status')
        .eq('company_id', companyId)
        .maybeSingle();
      if (instanceData?.status !== 'connected') return;

      const num = order.orderCode ? `#${order.orderCode}` : `#${String(order.dailyNumber).padStart(3, '0')}`;
      const lines: string[] = [];
      lines.push(`Olá, ${order.customerName.split(' ')[0]}! 👋`);
      lines.push('');
      lines.push(`Seu pedido ${num} foi *atualizado* com sucesso.`);
      lines.push('');
      lines.push('📋 *Pedido atualizado:*');
      for (const it of items) {
        const cleanName = cleanProductName(it.name);
        let prefix = '•';
        let suffix = '';
        if (it.isNew) {
          prefix = '➕';
          suffix = ' _(adicionado)_';
        } else if (it.swappedFrom) {
          prefix = '🔄';
          suffix = ` _(trocado de: ${it.swappedFrom})_`;
        }
        const lineTotal = (it.price * it.quantity).toFixed(2).replace('.', ',');
        lines.push(`${prefix} ${it.quantity}x ${cleanName} - R$ ${lineTotal}${suffix}`);
      }
      lines.push('');
      if (modalityChanged) {
        if (modality === 'delivery') {
          const addr = buildFinalDeliveryAddress();
          lines.push(`🚚 *Modalidade:* Entrega${addr ? ` — ${addr}` : ''}`);
          if (newDeliveryFee > 0) {
            lines.push(`   Taxa de entrega: R$ ${newDeliveryFee.toFixed(2).replace('.', ',')}`);
          }
        } else {
          lines.push('🏪 *Modalidade:* Retirada no local');
        }
      }
      if (paymentChanged) {
        let payLine = `💳 *Pagamento:* ${newPaymentName}`;
        if (isMoneyPayment && changeFor.trim()) payLine += ` (Troco para R$ ${changeFor.trim()})`;
        lines.push(payLine);
      }
      if (modalityChanged || paymentChanged) lines.push('');
      lines.push(`💰 *Novo total: R$ ${(newGrandTotal).toFixed(2).replace('.', ',')}*`);
      if (Math.abs(diff) > 0.001) {
        const sign = diff > 0 ? '+' : '-';
        lines.push(`(${sign}R$ ${Math.abs(diff).toFixed(2).replace('.', ',')} em relação ao pedido original)`);
      }
      const message = lines.join('\n');

      await supabase.functions.invoke('whatsapp-evolution', {
        body: {
          action: 'send_message',
          instanceName: instanceData.instance_name,
          phone: order.customerPhone,
          message,
          companyId,
          orderId: order.id,
        },
      });
    } catch (e) {
      console.warn('[OrderEdit] Falha ao enviar WhatsApp de edição:', e);
    }
  }

  async function handleSave() {
    if (saving) return;
    // Validação dos novos blocos
    if (modality === 'delivery') {
      if (requiresCustomerSelection && !resolvedCustomerId) {
        toast.error('Selecione um cliente antes de trocar para Entrega.');
        return;
      }
      if (!deliveryAddress.trim() || !deliveryNumber.trim() || !deliveryNeighborhood.trim()) {
        toast.error('Informe rua, número e bairro para a entrega.');
        return;
      }
      if (deliveryOption === 'neighborhood' && !selectedNeighborhoodId) {
        toast.error('Selecione o bairro de entrega.');
        return;
      }
    }
    if (
      paymentChanged &&
      isMoneyPayment &&
      !changeFor.trim()
    ) {
      toast.error('Informe o troco (ou "Não precisa de troco")');
      return;
    }
    setSaving(true);
    try {
      // Diff: novos itens (sem dbId) + trocas (com dbId mas swappedFrom).
      const inserts: WorkingItem[] = [];
      const updates: WorkingItem[] = [];
      for (const it of working) {
        if (!it.dbId || it.isNew) {
          inserts.push(it);
        } else if (it.swappedFrom) {
          updates.push(it);
        }
      }

      // Persistir UPDATES (trocas)
      for (const u of updates) {
        const { error } = await supabase
          .from('order_items')
          .update({
            product_id: u.pendingProductId || u.productId,
            name: u.name,
            price: u.price,
            notes: null,
            swapped_from: u.swappedFrom,
          } as any)
          .eq('id', u.dbId!);
        if (error) throw error;
      }

      // Persistir INSERTS (itens adicionados)
      const insertedRows: any[] = [];
      if (inserts.length > 0) {
        const payload = inserts.map((it) => ({
          order_id: order.id,
          company_id: companyId,
          product_id: it.pendingProductId || it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          notes: null,
          added_after: true,
        }));
        const { data, error } = await supabase
          .from('order_items')
          .insert(payload as any)
          .select();
        if (error) throw error;
        insertedRows.push(...(data || []));
      }

      // Recalcular total + endereço + pagamento e marcar audit trail nas notas.
      const stamp = new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
      const flags: string[] = [];
      if (inserts.length > 0 || updates.length > 0) flags.push('itens');
      if (modalityChanged) flags.push('entrega');
      if (paymentChanged) flags.push('pagamento');
      const auditTag = ` [EDITADO ${stamp}${flags.length ? ': ' + flags.join('+') : ''}]`;
      const rewrittenNotes = rebuildNotesWithPayment(order.notes);
      const newNotes = rewrittenNotes + auditTag;
      const finalDeliveryAddress = buildFinalDeliveryAddress();

      const orderUpdate: any = {
        total: newGrandTotal,
        notes: newNotes,
      };
      if (modalityChanged) {
        orderUpdate.delivery_address = finalDeliveryAddress;
      }
      // Atualiza cliente do pedido quando um novo cliente foi vinculado (Cliente Loja → cliente real).
      const nameChanged =
        (resolvedCustomerName || '').trim() &&
        resolvedCustomerName.trim() !== (order.customerName || '').trim();
      const phoneChanged =
        (resolvedCustomerPhone || '').trim() !== (order.customerPhone || '').trim();
      if (nameChanged) orderUpdate.customer_name = resolvedCustomerName.trim();
      if (phoneChanged) orderUpdate.customer_phone = resolvedCustomerPhone.trim() || null;

      const { error: orderErr } = await supabase
        .from('orders')
        .update(orderUpdate)
        .eq('id', order.id);
      if (orderErr) throw orderErr;

      // Persistir endereço novo no cadastro do cliente (best-effort).
      if (
        modality === 'delivery' &&
        resolvedCustomerId &&
        !selectedAddressId &&
        deliveryAddress.trim()
      ) {
        try {
          await createCustomerAddress({
            label: null,
            address: deliveryAddress.trim(),
            number: deliveryNumber.trim() || null,
            complement: deliveryComplement.trim() || null,
            neighborhood: deliveryNeighborhood.trim() || null,
            reference: deliveryReference.trim() || null,
            city: null,
            state: null,
            is_default: customerAddresses.length === 0,
          });
        } catch (e) {
          console.warn('[OrderEdit] Falha ao salvar endereço no cliente:', e);
        }
      }

      // Itens "delta" para impressão (apenas adicionados/trocados).
      const deltaItems: WorkingItem[] = [...inserts, ...updates];

      // Comanda de produção delta + recibo atualizado → print_queue.
      try {
        if (deltaItems.length > 0) {
          const html = buildDeltaProductionHtml(deltaItems, []);
          await supabase.from('print_queue').insert({
            company_id: companyId,
            html_content: html,
            label: `EDIÇÃO ${order.customerName} #${order.orderCode || order.dailyNumber}`,
          } as any);
        }
        // Só reimprime recibo se algo mudou (itens, entrega ou pagamento).
        const shouldReprintReceipt =
          deltaItems.length > 0 || modalityChanged || paymentChanged;
        if (shouldReprintReceipt) {
          const receiptHtml = buildUpdatedReceiptHtml(working, {
            deliveryAddress: finalDeliveryAddress,
            notes: newNotes,
            deliveryFee: newDeliveryFee,
          });
        await supabase.from('print_queue').insert({
          company_id: companyId,
            html_content: receiptHtml,
          label: `RECIBO EDITADO #${order.orderCode || order.dailyNumber}`,
        } as any);
        }
      } catch (e) {
        console.warn('[OrderEdit] Falha ao enfileirar impressão:', e);
      }

      // WhatsApp para o cliente (best-effort)
      void sendWhatsAppNotification(working);

      toast.success('Pedido editado com sucesso!');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      console.error('[OrderEdit] erro ao salvar:', e);
      toast.error('Erro ao salvar edição: ' + (e?.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Editar Pedido #{order.orderCode || order.dailyNumber}
          </DialogTitle>
        </DialogHeader>

        {pickerMode ? (
          pickerMode.type === 'add' ? (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Adicionar item ao pedido</span>
                <Button variant="ghost" size="sm" onClick={() => { setPickerMode(null); setSearch(''); }}>
                  Cancelar
                </Button>
              </div>
              <div className="flex-1 min-h-0 border rounded-md p-2">
                <PDVV2CategoryBrowser
                  companyId={companyId}
                  pdvOnly={true}
                  onProductSelect={handleProductFromBrowser}
                  maxHeightClassName="max-h-[60vh]"
                />
              </div>
            </div>
          ) : (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={'Buscar item para trocar (mesma categoria)...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="ghost" size="sm" onClick={() => { setPickerMode(null); setSearch(''); }}>
                Cancelar
              </Button>
            </div>
            <ScrollArea className="flex-1 min-h-0 border rounded-md">
              <div className="p-2 space-y-1">
                {pickerProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">
                    Nenhum produto trocável encontrado nesta categoria.
                  </p>
                )}
                {pickerProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSwapItem(p)}
                    className="w-full flex items-center justify-between p-2 rounded hover:bg-accent text-left"
                  >
                    <span className="text-sm">{p.name}</span>
                    <span className="text-sm text-green-600 font-semibold">
                      R$ {p.price.toFixed(2).replace('.', ',')}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          )
        ) : (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <ScrollArea className="flex-1 min-h-0 border rounded-md">
              <div className="p-2 space-y-4">
                {/* Itens */}
                <div className="space-y-2">
                {working.map((it, idx) => {
                  const cleanName = cleanProductName(it.name);
                  const swappable = isItemSwappable(it);
                  return (
                    <div
                      key={it.id}
                      className={cn(
                        'flex items-center justify-between gap-2 p-2 rounded border',
                        it.isNew && 'border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/20',
                        it.swappedFrom && 'border-amber-500/60 bg-amber-50/50 dark:bg-amber-950/20',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {it.quantity}x {cleanName}
                        </div>
                        {it.swappedFrom && (
                          <div className="text-xs text-amber-700 dark:text-amber-300">
                            🔄 trocado de: {it.swappedFrom}
                          </div>
                        )}
                        {it.isNew && (
                          <div className="text-xs text-emerald-700 dark:text-emerald-300">
                            ➕ adicionado agora
                          </div>
                        )}
                        {it.notes && !it.isNew && !it.swappedFrom && (
                          <div className="text-xs text-muted-foreground truncate">
                            {stripDescMarkers(it.notes)}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-green-600 whitespace-nowrap">
                        R$ {(it.price * it.quantity).toFixed(2).replace('.', ',')}
                      </div>
                      {swappable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPickerMode({ type: 'swap', targetIndex: idx })}
                          className="gap-1 shrink-0"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Trocar
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  onClick={() => setPickerMode({ type: 'add' })}
                  className="gap-1 self-start"
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar item
                </Button>
                </div>

                {/* Bloco: Entrega */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {modality === 'delivery' ? <Bike className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                    Entrega
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={modality === 'pickup' ? 'default' : 'outline'}
                      className="gap-1 flex-1"
                      onClick={() => setModality('pickup')}
                    >
                      <Store className="w-4 h-4" /> Retirada
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={modality === 'delivery' ? 'default' : 'outline'}
                      className="gap-1 flex-1"
                      onClick={() => setModality('delivery')}
                    >
                      <Bike className="w-4 h-4" /> Entrega
                    </Button>
                  </div>
                  {modality === 'delivery' && (
                    <div className="space-y-2">
                      {/* Cliente obrigatório quando é "Cliente Loja" → Entrega */}
                      {requiresCustomerSelection && !resolvedCustomerId && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/20 p-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1 text-xs">
                            <div className="font-medium text-amber-900 dark:text-amber-200">
                              Selecione um cliente para continuar
                            </div>
                            <div className="text-amber-800/80 dark:text-amber-300/80">
                              Pedidos de "Cliente Loja" precisam de um cliente cadastrado para virar Entrega.
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2 gap-1"
                              onClick={() => setCustomerPickerOpen(true)}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Informar cliente
                            </Button>
                          </div>
                        </div>
                      )}
                      {resolvedCustomerId && (
                        <div className="text-xs text-muted-foreground">
                          Cliente: <span className="font-medium text-foreground">{resolvedCustomerName}</span>
                          {resolvedCustomerPhone && <> · {resolvedCustomerPhone}</>}
                        </div>
                      )}

                      {/* Endereços salvos */}
                      {resolvedCustomerId && customerAddresses.length > 0 && (
                        <CustomerAddressPicker
                          addresses={customerAddresses}
                          selectedId={selectedAddressId}
                          onSelect={(a: CustomerAddress) => {
                            setSelectedAddressId(a.id);
                            setDeliveryAddress(a.address ?? '');
                            setDeliveryNumber(a.number ?? '');
                            setDeliveryComplement(a.complement ?? '');
                            setDeliveryNeighborhood(a.neighborhood ?? '');
                            setDeliveryReference(a.reference ?? '');
                            // tenta casar bairro cadastrado na loja
                            if (a.neighborhood && storeSettings.deliveryMode === 'neighborhood') {
                              const match = neighborhoods.find(
                                (n) => n.active && n.neighborhoodName.trim().toLowerCase() === (a.neighborhood ?? '').trim().toLowerCase(),
                              );
                              setSelectedNeighborhoodId(match?.id ?? '');
                              setDeliveryOption('neighborhood');
                            }
                          }}
                          onNew={() => {
                            setSelectedAddressId(null);
                            setNewAddrForm({ label: '', address: '', number: '', complement: '', neighborhood: '', reference: '' });
                            setNewAddrOpen(true);
                          }}
                          onDelete={async (id) => { await removeCustomerAddress(id); if (selectedAddressId === id) setSelectedAddressId(null); }}
                          onSetDefault={async (id) => { await setCustomerAddressDefault(id); }}
                        />
                      )}
                      {resolvedCustomerId && customerAddresses.length === 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 self-start"
                          onClick={() => {
                            setNewAddrForm({ label: '', address: '', number: '', complement: '', neighborhood: '', reference: '' });
                            setNewAddrOpen(true);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Novo endereço
                        </Button>
                      )}

                      {/* Campos estruturados */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                        <div>
                          <Label className="text-xs">Logradouro *</Label>
                          <Input
                            placeholder="Rua, avenida..."
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Número *</Label>
                          <Input
                            placeholder="123"
                            inputMode="numeric"
                            value={deliveryNumber}
                            onChange={(e) => setDeliveryNumber(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Complemento</Label>
                        <Input
                          placeholder="Apto, sala, bloco..."
                          value={deliveryComplement}
                          onChange={(e) => setDeliveryComplement(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Bairro *</Label>
                        <Input
                          placeholder="Nome do bairro"
                          value={deliveryNeighborhood}
                          onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Ponto de referência</Label>
                        <Input
                          placeholder="Próximo à..."
                          value={deliveryReference}
                          onChange={(e) => setDeliveryReference(e.target.value)}
                        />
                      </div>

                      {/* Opções de entrega da loja */}
                      <div className="border-t pt-2">
                        <Label className="text-xs">Opção de entrega</Label>
                        {storeSettings.deliveryMode === 'neighborhood' && neighborhoods.filter((n) => n.active).length > 0 ? (
                          <div className="mt-1 space-y-1">
                            <Select value={selectedNeighborhoodId} onValueChange={(v) => { setSelectedNeighborhoodId(v); setDeliveryOption('neighborhood'); }}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o bairro atendido" />
                              </SelectTrigger>
                              <SelectContent>
                                {neighborhoods.filter((n) => n.active).map((n) => (
                                  <SelectItem key={n.id} value={n.id}>
                                    {n.neighborhoodName} — R$ {n.deliveryFee.toFixed(2).replace('.', ',')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {deliveryNeighborhood && !selectedNeighborhoodId && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                Bairro "{deliveryNeighborhood}" não está cadastrado — a taxa será R$ 0,00.
                              </p>
                            )}
                          </div>
                        ) : (
                          <RadioGroup
                            value={deliveryOption}
                            onValueChange={(v) => setDeliveryOption(v as any)}
                            className="mt-1 space-y-1"
                          >
                            {(storeSettings.deliveryFeeCityEnabled !== false) && (
                              <label className="flex items-center gap-2 rounded border p-2 text-sm cursor-pointer">
                                <RadioGroupItem value="city" id="oed-city" />
                                <span className="flex-1">Entrega na cidade</span>
                                <span className="text-xs text-muted-foreground">
                                  {storeSettings.deliveryFeeCity > 0 ? `R$ ${storeSettings.deliveryFeeCity.toFixed(2).replace('.', ',')}` : 'Grátis'}
                                </span>
                              </label>
                            )}
                            {(storeSettings.deliveryFeeInteriorEnabled !== false) && (
                              <label className="flex items-center gap-2 rounded border p-2 text-sm cursor-pointer">
                                <RadioGroupItem value="interior" id="oed-interior" />
                                <span className="flex-1">Entrega no interior</span>
                                <span className="text-xs text-muted-foreground">
                                  {storeSettings.deliveryFeeInterior > 0 ? `R$ ${storeSettings.deliveryFeeInterior.toFixed(2).replace('.', ',')}` : 'Grátis'}
                                </span>
                              </label>
                            )}
                          </RadioGroup>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Taxa de entrega:{' '}
                        <span className="font-semibold text-foreground">
                          R$ {newDeliveryFee.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </ScrollArea>

            {/* Bloco: Forma de pagamento — fica FORA do ScrollArea para estar sempre visível. */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="w-4 h-4" />
                Forma de pagamento
              </div>
              {originalPaymentName && (
                <div className="text-xs text-muted-foreground">
                  Atual: <span className="font-medium text-foreground">{originalPaymentName}</span>
                </div>
              )}
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {activePaymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isMoneyPayment && (
                <div>
                  <Label className="text-xs">Troco para R$</Label>
                  <Input
                    placeholder="Ex: 50,00 ou 'Não precisa'"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                  />
                </div>
              )}
              {isPixPayment && selectedPixKey && (
                <div className="text-xs text-muted-foreground">
                  Chave PIX: <span className="font-mono text-foreground">{selectedPixKey}</span>
                </div>
              )}
            </div>

            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total original</span>
                <span>R$ {order.total.toFixed(2).replace('.', ',')}</span>
              </div>
              {modality === 'delivery' && newDeliveryFee > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Taxa de entrega</span>
                  <span>R$ {newDeliveryFee.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Novo total</span>
                <span className="text-green-600">R$ {newGrandTotal.toFixed(2).replace('.', ',')}</span>
              </div>
              {Math.abs(diff) > 0.001 && (
                <div className={cn('flex justify-between text-xs', diff > 0 ? 'text-emerald-700' : 'text-amber-700')}>
                  <span>Diferença</span>
                  <span>{diff > 0 ? '+' : '-'} R$ {Math.abs(diff).toFixed(2).replace('.', ',')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !!pickerMode}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar edição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {optionalsProduct && (
      <PDVOptionalsDialog
        open={!!optionalsProduct}
        onOpenChange={(o) => { if (!o) setOptionalsProduct(null); }}
        product={{
          id: optionalsProduct.id,
          name: optionalsProduct.name,
          price: optionalsProduct.price,
          imageUrl: optionalsProduct.imageUrl,
          category: optionalsProduct.category,
        }}
        groups={getGroupsForProduct(optionalsProduct.id, optionalsProduct.category)}
        onAddToCart={handleAddFromOptionals}
        companyId={companyId}
      />
    )}

    <FrenteCaixaCustomerDialog
      open={customerPickerOpen}
      onOpenChange={setCustomerPickerOpen}
      companyId={companyId}
      onPick={async (c) => {
        // Após escolher/cadastrar, resolve o customer_id pelo telefone.
        const name = (c.name || '').trim();
        const phone = (c.phone || '').trim();
        if (name) setResolvedCustomerName(name);
        if (phone) setResolvedCustomerPhone(phone);
        const digits = phone.replace(/\D/g, '');
        if (digits) {
          try {
            const { data } = await supabase
              .from('customers')
              .select('id, address, number, complement, neighborhood')
              .eq('company_id', companyId)
              .eq('phone', digits)
              .maybeSingle();
            if (data?.id) {
              setResolvedCustomerId(data.id);
              // Pré-preenche endereço se cliente já tem um cadastrado no perfil
              if (data.address && !deliveryAddress) {
                setDeliveryAddress(data.address || '');
                setDeliveryNumber((data as any).number || '');
                setDeliveryComplement((data as any).complement || '');
                setDeliveryNeighborhood((data as any).neighborhood || '');
              }
            }
          } catch (e) {
            console.warn('[OrderEdit] Falha ao resolver cliente:', e);
          }
        }
        setCustomerPickerOpen(false);
      }}
    />

    {/* Modal: Novo endereço */}
    <Dialog open={newAddrOpen} onOpenChange={setNewAddrOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo endereço</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Rótulo (opcional)</Label>
            <Input
              placeholder="Casa, Trabalho..."
              value={newAddrForm.label}
              onChange={(e) => setNewAddrForm((p) => ({ ...p, label: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
            <div>
              <Label className="text-xs">Logradouro *</Label>
              <Input
                placeholder="Rua, avenida..."
                value={newAddrForm.address}
                onChange={(e) => setNewAddrForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Número *</Label>
              <Input
                placeholder="123"
                inputMode="numeric"
                value={newAddrForm.number}
                onChange={(e) => setNewAddrForm((p) => ({ ...p, number: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Complemento</Label>
            <Input
              placeholder="Apto, sala..."
              value={newAddrForm.complement}
              onChange={(e) => setNewAddrForm((p) => ({ ...p, complement: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Bairro *</Label>
            <Input
              placeholder="Nome do bairro"
              value={newAddrForm.neighborhood}
              onChange={(e) => setNewAddrForm((p) => ({ ...p, neighborhood: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Ponto de referência</Label>
            <Input
              placeholder="Próximo a..."
              value={newAddrForm.reference}
              onChange={(e) => setNewAddrForm((p) => ({ ...p, reference: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setNewAddrOpen(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              if (!newAddrForm.address.trim() || !newAddrForm.number.trim() || !newAddrForm.neighborhood.trim()) {
                toast.error('Preencha rua, número e bairro.');
                return;
              }
              if (!resolvedCustomerId) {
                toast.error('Cliente não encontrado.');
                return;
              }
              const created = await createCustomerAddress({
                label: newAddrForm.label.trim() || null,
                address: newAddrForm.address.trim(),
                number: newAddrForm.number.trim() || null,
                complement: newAddrForm.complement.trim() || null,
                neighborhood: newAddrForm.neighborhood.trim() || null,
                reference: newAddrForm.reference.trim() || null,
                city: null,
                state: null,
                is_default: customerAddresses.length === 0,
              });
              if (created) {
                setSelectedAddressId(created.id);
                setDeliveryAddress(created.address ?? '');
                setDeliveryNumber(created.number ?? '');
                setDeliveryComplement(created.complement ?? '');
                setDeliveryNeighborhood(created.neighborhood ?? '');
                setDeliveryReference(created.reference ?? '');
                if (created.neighborhood && storeSettings.deliveryMode === 'neighborhood') {
                  const match = neighborhoods.find(
                    (n) => n.active && n.neighborhoodName.trim().toLowerCase() === (created.neighborhood ?? '').trim().toLowerCase(),
                  );
                  setSelectedNeighborhoodId(match?.id ?? '');
                  setDeliveryOption('neighborhood');
                }
                toast.success('Endereço adicionado!');
                setNewAddrOpen(false);
              } else {
                toast.error('Erro ao salvar endereço.');
              }
            }}
          >
            Salvar endereço
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}