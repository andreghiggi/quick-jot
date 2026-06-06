import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useOrderContext } from '@/contexts/OrderContext';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useTabs } from '@/hooks/useTabs';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { buildNfceFiscalFields } from '@/utils/nfceItemFiscal';
import { Order, OrderStatus } from '@/types/order';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { PDVV2TopBar } from '@/components/pdv-v2/PDVV2TopBar';
import { PDVV2SummaryCards } from '@/components/pdv-v2/PDVV2SummaryCards';
import { PDVV2StatusFilters, StatusFilter } from '@/components/pdv-v2/PDVV2StatusFilters';
import { OrderCard } from '@/components/OrderCard';
import { OccupiedTab } from '@/components/pdv-v2/PDVV2TablesPanel';
import { PDVV2TablesGrid } from '@/components/pdv-v2/PDVV2TablesGrid';
import { PDVV2TablesSummaryCards } from '@/components/pdv-v2/PDVV2TablesSummaryCards';
import { PDVV2CloseCashDialog, CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { PDVV2ClosedTabsDialog, ClosedTabSale } from '@/components/pdv-v2/PDVV2ClosedTabsDialog';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClipboardList, UtensilsCrossed } from 'lucide-react';

import { printOnlyReceipt } from '@/utils/pdvV2Print';
import { emitirNFCe, NFCeItem, NFCeTefData, NFCeRecord } from '@/services/nfceService';
import { runTefPayment, TefOptions } from '@/utils/pdvV2Tef';
import { PDVV2NFCePostSaleDialog } from '@/components/pdv-v2/PDVV2NFCePostSaleDialog';
import { TEF_PRINT_PROMPT_CLOSED_EVENT } from '@/components/TefPrintPromptDialog';
import { PDVV2SequentialPaymentDialog } from '@/components/pdv-v2/PDVV2SequentialPaymentDialog';
import { runMultiPayment, buildPagamentosSplit, type MultiPaymentInputLine } from '@/utils/pdvV2MultiPayment';
function isDelivery(o: Order) {
  return !!o.deliveryAddress && o.deliveryAddress.trim().length > 0;
}

export default function PDVV2() {
  const { company, user } = useAuthContext();
  const companyId = company?.id;
  // Hide delivered orders from PDV V2 dashboard — aplicado a todas as lojas com PDV V2 ativo.
  // Pedidos entregues continuam disponíveis em Pedidos / Relatórios; aqui apenas saem do grid
  // para manter o painel operacional limpo.
  const hideDelivered = true;
  // Hide "Entregar" and show "Cobrar" for pickup orders — currently only for Lancheria da I9
  const chargeBeforeDeliverEnabled = companyId === '8c9e7a0e-dbb6-49b9-8344-c23155a71164';

  const { isModuleEnabled } = useCompanyModules({ companyId });
  const tablesEnabled = isModuleEnabled('mesas');

  const { orders, updateOrderStatus, refetch: refetchOrders } = useOrderContext();
  const dashboardOrders = useMemo(
    () => {
      // Only show today's orders (America/Sao_Paulo)
      const nowSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayStart = new Date(nowSP.getFullYear(), nowSP.getMonth(), nowSP.getDate());
      let filtered = orders.filter((o) => {
        if (o.notes?.includes('[CANCELADA]')) return false;
        const orderDateSP = new Date(new Date(o.createdAt).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        return orderDateSP >= todayStart;
      });
      return filtered;
    },
    [orders]
  );

  // Orders visible in the grid (respects hideDelivered toggle)
  const visibleOrders = useMemo(
    () => hideDelivered ? dashboardOrders.filter((o) => o.status !== 'delivered') : dashboardOrders,
    [dashboardOrders, hideDelivered]
  );
  const {
    currentRegister,
    totalSales,
    sales,
    openRegister,
    closeRegister,
    addSale,
    refetch: refetchCash,
    loading: cashLoading,
    cashOpenKnown,
    isOpening,
  } = useCashRegister({ companyId });
  const { openTabs, closeTab, deleteTab, refetch: refetchTabs } = useTabs({ companyId });
  const { settings } = useStoreSettings({ companyId });
  const { activePaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });
  const { activePaymentMethods: menuPaymentMethods } = usePaymentMethods({ companyId, channel: 'menu' });
  const { products } = useProducts({ companyId });
  const { taxRules } = useTaxRules({ companyId });
  const { enabled: mercadoEnabled } = useMercadoEnabled(companyId);
  const fiscalEnabled = isModuleEnabled('fiscal');

  const [showCash, setShowCash] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showTablesRevenue, setShowTablesRevenue] = useState(false);
  const tabStorageKey = companyId ? `pdvv2_active_tab_${companyId}` : null;
  const filterStorageKey = companyId ? `pdvv2_status_filter_${companyId}` : null;
  const [activeTab, setActiveTab] = useState<'orders' | 'tables'>('orders');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [storageHydrated, setStorageHydrated] = useState(false);
  // Hydrate state from localStorage once companyId is available, before persisting back.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tabStorageKey || !filterStorageKey) return;
    try {
      const savedTab = window.localStorage.getItem(tabStorageKey);
      if (savedTab === 'tables' || savedTab === 'orders') {
        setActiveTab(savedTab);
      }
      const savedFilter = window.localStorage.getItem(filterStorageKey);
      const valid: StatusFilter[] = ['all', 'pending', 'preparing', 'ready', 'delivered'];
      if (savedFilter && (valid as string[]).includes(savedFilter)) {
        setFilter(savedFilter as StatusFilter);
      }
    } catch {
      /* ignore */
    }
    setStorageHydrated(true);
  }, [tabStorageKey, filterStorageKey]);
  useEffect(() => {
    if (!storageHydrated || !tabStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(tabStorageKey, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab, tabStorageKey, storageHydrated]);
  useEffect(() => {
    if (!storageHydrated || !filterStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(filterStorageKey, filter);
    } catch {
      /* ignore */
    }
  }, [filter, filterStorageKey, storageHydrated]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [openCashOpen, setOpenCashOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [importingTab, setImportingTab] = useState<(OccupiedTab & { _splitPerson?: number; _splitTotal?: number; _splitPerPerson?: number }) | null>(null);
  const [closedTabsOpen, setClosedTabsOpen] = useState(false);
  const [i9PartialItemIds, setI9PartialItemIds] = useState<string[]>([]);
  const [i9SplitInfo, setI9SplitInfo] = useState<{ perPerson: number; remaining: number; total: number } | null>(null);
  const [i9OriginalTabId, setI9OriginalTabId] = useState<string | null>(null);
  const i9SplitTransitionRef = useRef(false);
  const [isEmittingNfce, setIsEmittingNfce] = useState(false);
  // NFC-e pós-venda (mesmo padrão do PDV V1: polling visível + ação do operador)
  const [nfceDialogOpen, setNfceDialogOpen] = useState(false);
  const [nfceRecord, setNfceRecord] = useState<NFCeRecord | null>(null);
  const [nfceAutoPrint, setNfceAutoPrint] = useState(false);
  const [pendingPostSale, setPendingPostSale] = useState<null | (() => void | Promise<void>)>(null);
  // Multi-payment (v1.6 beta) — fluxo isolado para Cobrar Comanda/Mesa.
  // NÃO altera confirmImportTab/confirmImportTabI9 (TEF v1.1 frozen).
  const [multiPayOpen, setMultiPayOpen] = useState(false);
  const [multiPayProcessing, setMultiPayProcessing] = useState(false);
  const [multiPayStatus, setMultiPayStatus] = useState('');
  const [multiPayTab, setMultiPayTab] = useState<OccupiedTab | null>(null);
  // Status do processamento TEF (banner no topo do diálogo de cobrança)
  const [tefStatus, setTefStatus] = useState('');

  // ---- Lancheria I9: serializa NFC-e ↔ prompt TEF -----------------------
  // Isolado por companyId para não impactar outras lojas. O overlay de
  // emissão deixa de ser bloqueante e o pop-up pós-venda da NFC-e só abre
  // depois que o operador fecha o prompt de impressão TEF.
  const I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
  const isI9Company = companyId === I9_COMPANY_ID;
  const [tefPromptOpen, setTefPromptOpen] = useState(false);
  const tefPromptOpenRef = useRef(false);
  const [pendingNfceOpen, setPendingNfceOpen] = useState(false);

  useEffect(() => {
    function onOpened() { tefPromptOpenRef.current = true; setTefPromptOpen(true); }
    function onClosed() { tefPromptOpenRef.current = false; setTefPromptOpen(false); }
    window.addEventListener('tef-auto-print-prompt-opened', onOpened as EventListener);
    window.addEventListener(TEF_PRINT_PROMPT_CLOSED_EVENT, onClosed as EventListener);
    return () => {
      window.removeEventListener('tef-auto-print-prompt-opened', onOpened as EventListener);
      window.removeEventListener(TEF_PRINT_PROMPT_CLOSED_EVENT, onClosed as EventListener);
    };
  }, []);

  // Quando o prompt TEF fecha, libera a abertura adiada do diálogo NFC-e.
  useEffect(() => {
    if (!tefPromptOpen && pendingNfceOpen && nfceRecord) {
      setNfceDialogOpen(true);
      setPendingNfceOpen(false);
    }
  }, [tefPromptOpen, pendingNfceOpen, nfceRecord]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: dashboardOrders.length,
      pending: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
    };
    for (const o of dashboardOrders) c[o.status as OrderStatus]++;
    return c;
  }, [dashboardOrders]);

  // Faturamento do dia: filtra vendas do caixa para mostrar apenas as de hoje (America/Sao_Paulo)
  const revenue = useMemo(() => {
    const nowSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStart = new Date(nowSP.getFullYear(), nowSP.getMonth(), nowSP.getDate());
    return (sales || []).reduce((sum, s) => {
      const saleDateSP = new Date(new Date(s.created_at).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      if (saleDateSP >= todayStart) {
        return sum + (Number(s.final_total) || 0);
      }
      return sum;
    }, 0);
  }, [sales]);

  const filteredOrders = useMemo(
    () => (filter === 'all' ? visibleOrders : visibleOrders.filter((o) => o.status === filter)),
    [visibleOrders, filter]
  );

  const occupiedTabs: OccupiedTab[] = useMemo(
    () =>
      openTabs.map((t) => ({
        id: t.id,
        tabNumber: t.tab_number,
        tableNumber: t.table?.number ?? null,
        customerName: t.customer_name,
        total: t.items?.reduce((s, i) => s + ((i as any).paid ? 0 : i.total_price), 0) || 0,
        items: (t.items || [])
          .filter((i: any) => !i.paid)
          .map((i: any) => ({
            id: i.id,
            productName: i.product_name,
            quantity: i.quantity,
            totalPrice: i.total_price,
            notes: i.notes,
          })),
      })),
    [openTabs]
  );

  // Métricas da aba Mesas — todas as comandas finalizadas do caixa aberto atual
  const tablesMetrics = useMemo(() => {
    let closedToday = 0;
    let revenueToday = 0;
    for (const s of sales) {
      const isFromTab = s.notes?.toLowerCase().includes('comanda');
      if (!isFromTab) continue;
      closedToday++;
      revenueToday += Number(s.final_total) || 0;
    }
    const occupiedTables = occupiedTabs.filter((t) => t.tableNumber != null).length;
    return {
      occupiedTables,
      openTabsCount: occupiedTabs.length,
      closedToday,
      revenueToday,
    };
  }, [sales, occupiedTabs]);

  // Vendas finalizadas vindas de comandas (caixa atual)
  const closedTabSales: ClosedTabSale[] = useMemo(() => {
    return sales
      .filter((s) => s.notes?.toLowerCase().includes('comanda'))
      .map((s) => ({
        id: s.id,
        final_total: Number(s.final_total) || 0,
        customer_name: s.customer_name || null,
        notes: s.notes || null,
        created_at: s.created_at,
        payment_method_name: s.payment_method?.name || 'Sem forma',
      }));
  }, [sales]);

  // Soma das vendas canceladas (venda com [CANCELADA] nas notes OU
  // pedido vinculado marcado como [CANCELADA]). Essas vendas não devem
  // contar no valor esperado em caixa nem no fechamento, mas continuam
  // visíveis nos registros (histórico/Comandas Finalizadas).
  const cancelledSalesTotal = useMemo(() => {
    return sales.reduce((acc, s) => {
      const saleCancelled = !!s.notes?.includes('[CANCELADA]');
      let orderCancelled = false;
      const orderId = (s as any).order_id as string | undefined;
      if (orderId) {
        const linked = orders.find((o) => o.id === orderId);
        if (linked?.notes?.includes('[CANCELADA]')) orderCancelled = true;
      }
      return saleCancelled || orderCancelled ? acc + (Number(s.final_total) || 0) : acc;
    }, 0);
  }, [sales, orders]);

  const cashAmount = (currentRegister?.opening_amount || 0) + totalSales - cancelledSalesTotal;
  const cashOpen = !!currentRegister;
  // Estado a ser exibido na UI: prefere o cache otimista enquanto a query
  // inicial não retornou, evitando o flash de "Caixa Fechado".
  const cashOpenForDisplay = cashLoading && cashOpenKnown !== null ? cashOpenKnown : cashOpen;
  // Se ainda não sabemos absolutamente nada (primeiro acesso) e estamos
  // carregando, suprimimos completamente os blocos condicionais para não
  // piscar nem "Caixa Fechado" nem o conteúdo errado.
  const cashStateUnknown = cashLoading && cashOpenKnown === null;

  // Mapeia vendas do caixa atual em estrutura para o fechamento
  const closeCashSales: CloseCashSale[] = useMemo(() => {
    return sales.flatMap((s) => {
      // Exclui vendas canceladas do fechamento de caixa — elas continuam
      // existindo na base e visíveis em outras telas (Comandas Finalizadas,
      // histórico), mas não somam no valor esperado de fechamento.
      const saleCancelled = !!s.notes?.includes('[CANCELADA]');
      const orderId = (s as any).order_id as string | undefined;
      const linkedOrder = orderId ? orders.find((o) => o.id === orderId) : undefined;
      if (saleCancelled || linkedOrder?.notes?.includes('[CANCELADA]')) {
        return [];
      }
      // Determina origem cruzando com orders (quando há order_id)
      let origin: CloseCashSale['origin'] = 'balcao';

      // Extrai sub-tipo TEF das notes (Débito, Crédito à Vista, Parcelado, PIX)
      let pmName = s.payment_method?.name || 'Sem forma';
      if (s.notes) {
        const tefMatch = s.notes.match(/\|\s*(Débito|Crédito à Vista|PIX|\d+x\s*(?:Cartão\s*(?:ADM|Loja)|Crédito))/i);
        if (tefMatch) {
          pmName = `${pmName} (${tefMatch[1]})`;
        }
      }

      if (orderId) {
        if (linkedOrder) {
          if (linkedOrder.origin === 'mesa') origin = 'mesa';
          else if (linkedOrder.origin === 'balcao') origin = 'balcao';
          else origin = isDelivery(linkedOrder) ? 'cardapio_delivery' : 'cardapio_retirada';
        } else {
          origin = 'outros';
        }
      } else {
        // Sem order vinculado — venda balcão direta
        // ou comanda importada (notes contém "Comanda")
        if (s.notes?.toLowerCase().includes('comanda')) origin = 'mesa';
        else origin = 'balcao';
      }

      return [{
        id: s.id,
        final_total: Number(s.final_total) || 0,
        payment_method_id: s.payment_method_id || null,
        payment_method_name: pmName,
        customer_name: s.customer_name || null,
        created_at: s.created_at,
        origin,
      }];
    });
  }, [sales, orders]);

  function handleAdvance(order: Order) {
    const next: Record<OrderStatus, OrderStatus | null> = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'delivered',
      delivered: null,
    };
    const target = next[order.status];
    if (target) updateOrderStatus(order.id, target);
  }


  async function handleChangePayment(order: Order, methodName: string) {
    try {
      const baseNotes = order.notes || '';
      const newNotes = baseNotes.match(/Pagamento:\s*.+?(\s*[\(|]|$)/i)
        ? baseNotes.replace(/Pagamento:\s*.+?(\s*[\(|]|$)/i, `Pagamento: ${methodName}$1`)
        : baseNotes
        ? `${baseNotes} | Pagamento: ${methodName}`
        : `Pagamento: ${methodName}`;

      const { error } = await supabase
        .from('orders')
        .update({ notes: newNotes })
        .eq('id', order.id);
      if (error) throw error;
      toast.success('Forma de pagamento atualizada');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao atualizar pagamento');
    }
  }

  // Helper compartilhado: emite NFC-e a partir dos itens da venda e devolve o
  // registro inicial criado em `nfce_records`. O acompanhamento (polling SEFAZ
  // + impressão do DANFE) é feito pelo diálogo PDVV2NFCePostSaleDialog —
  // mesmo padrão usado no PDV V1, garantindo que o operador autorize o fechamento.
  async function emitNFCeAndOpenDialog(args: {
    saleId: string;
    items: { product_id: string | null; product_name: string; quantity: number; unit_price: number }[];
    discount: number;
    customerName?: string | null;
    shouldPrint: boolean;
    tefData?: NFCeTefData;
    customerDocument?: string;
    extraObservacoes?: string;
  }): Promise<boolean> {
    const { saleId, items, discount, customerName, shouldPrint, tefData, customerDocument, extraObservacoes } = args;
    if (!companyId || !currentRegister) return false;
    setIsEmittingNfce(true);
    try {
      const nfceItems: NFCeItem[] = items.map((it) => {
        const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
        const taxRule = product?.taxRuleId ? taxRules.find((tr) => tr.id === product.taxRuleId) : null;
        // Para itens sintéticos (sem produto/regra fiscal) — ex.: linha "Divisão X/Y"
        // criada no fluxo de rachar comanda — usar NCM genérico de "outros produtos"
        // (21069090) em vez de '00000000', que é rejeitado pela SEFAZ (rejeição 814).
        const fallbackNcm = it.product_id ? '00000000' : '21069090';
        return {
          codigo: product?.code || it.product_id || 'AVULSO',
          descricao: it.product_name,
          unidade: product?.unit || 'UN',
          quantidade: it.quantity,
          valor_unitario: it.unit_price,
          ...buildNfceFiscalFields({ product, taxRule, mercadoEnabled, fallbackNcm }),
        };
      });

      const externalId = `PDVV2-${currentRegister.id.substring(0, 8)}-${Date.now()}`;
      const cleanDoc = (customerDocument || '').replace(/\D/g, '');
      const destinatario = cleanDoc.length === 11
        ? { cpf: cleanDoc, nome: customerName || undefined }
        : cleanDoc.length === 14
          ? { cnpj: cleanDoc, nome: customerName || undefined }
          : undefined;
      const obsParts: string[] = [];
      if (customerName) obsParts.push(`Cliente: ${customerName}`);
      if (extraObservacoes) obsParts.push(extraObservacoes);
      const observacoes = obsParts.length ? obsParts.join(' | ') : undefined;
      await emitirNFCe(companyId, saleId, {
        external_id: externalId,
        itens: nfceItems,
        valor_desconto: discount || 0,
        valor_frete: 0,
        observacoes,
        destinatario,
        tef: tefData,
      } as any);
      toast.success('NFC-e enviada para processamento!');

      // Busca o registro recém-criado para abrir o pop-up de status
      const { data: rec } = await supabase
        .from('nfce_records')
        .select('*')
        .eq('sale_id', saleId)
        .maybeSingle();

      if (rec) {
        setNfceRecord(rec as unknown as NFCeRecord);
        setNfceAutoPrint(shouldPrint);
        // Na Lancheria I9, se o prompt TEF estiver aberto, adia a abertura do
        // diálogo pós-venda da NFC-e até o operador fechar o prompt — evita
        // que o overlay/dialog cubra os botões de impressão TEF.
        if (isI9Company && tefPromptOpenRef.current) {
          setPendingNfceOpen(true);
        } else {
          setNfceDialogOpen(true);
        }
      }
      setIsEmittingNfce(false);
      return true;
    } catch (err: any) {
      console.error('[PDVV2] NFC-e emission error:', err);
      toast.error(`Venda registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`);
      setIsEmittingNfce(false);
      return false;
    }
  }


  async function confirmImportTab({
    paymentMethodId,
    paymentName,
    discount,
    finalTotal,
    documentMode,
    extraItems,
    printDocument,
    tefOptions,
    tefIntegration,
    customerDocument,
  }: { paymentMethodId: string; paymentName: string; discount: number; finalTotal: number; documentMode: 'sale_only' | 'sale_with_nfce'; extraItems: { product_id: string | null; product_name: string; quantity: number; unit_price: number }[]; printDocument?: boolean; tefOptions?: TefOptions; tefIntegration?: 'tef_pinpad' | 'tef_smartpos'; customerDocument?: string }) {
    if (!importingTab || !user || !currentRegister || !companyId) {
      toast.error('Caixa precisa estar aberto');
      return;
    }
    const fullTab = openTabs.find((t) => t.id === importingTab.id);
    if (!fullTab?.items?.length) {
      toast.error('Comanda sem itens');
      return;
    }
    const baseItems = fullTab.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));
    const items = [...baseItems, ...extraItems.map(({ product_id, product_name, quantity, unit_price }) => ({ product_id, product_name, quantity, unit_price }))];
    const customer =
      fullTab.customer_name ||
      (fullTab.table?.number ? `Mesa ${fullTab.table.number}` : `Comanda ${fullTab.tab_number}`);

    // ===== TEF: roda ANTES de criar a venda (igual PDV V1). Aborta se falhar.
    let tefData: NFCeTefData | undefined;
    let tefNotesFragment = '';
    if (tefIntegration && tefOptions) {
      const result = await runTefPayment({
        companyId,
        integration: tefIntegration,
        amount: finalTotal,
        options: tefOptions,
        description: `Comanda #${fullTab.tab_number} - ${customer}`,
        onStatus: setTefStatus,
      });
      setTefStatus('');
      if (!result.success) return;
      tefData = result.tefData;
      tefNotesFragment = result.notesFragment ? ` | ${result.notesFragment}` : '';
    }

    const saleId = await addSale(
      items,
      paymentMethodId,
      user.id,
      discount,
      customer,
      `Comanda #${fullTab.tab_number} | Pagamento: ${paymentName}${tefNotesFragment}`
    );
    if (saleId) {
      // NFC-e: TEF força emissão (regra V1). Caso contrário, segue documentMode.
      const wantsNfce = (tefIntegration ? true : documentMode === 'sale_with_nfce') && fiscalEnabled && companyId;
      // Imprime se: I9 escolheu "Imprimir" no pop-up, ou demais lojas (comportamento original)
      const shouldPrint = printDocument !== false;
      if (wantsNfce) {
        // Só fecha a comanda depois que o
        // operador autorizar o fechamento do pop-up de NFC-e.
        const tabIdToClose = fullTab.id;
        setPendingPostSale(() => async () => {
          await closeTab(tabIdToClose);
          toast.success('Comanda importada e fechada!');
        });
        const ok = await emitNFCeAndOpenDialog({
          saleId,
          items,
          discount,
          // Só envia nome do cliente para a NFC-e quando for um cliente real
          // (informado na comanda). Placeholders como "Mesa 2"/"Comanda 5"
          // não devem virar destinatário, senão a SEFAZ rejeita o XML por
          // falta de CPF/CNPJ no bloco <dest>.
          customerName: fullTab.customer_name || null,
          shouldPrint,
          tefData,
          customerDocument,
        });
        if (!ok) {
          await closeTab(fullTab.id);
          setPendingPostSale(null);
        }
        setImportingTab(null);
        return;
      } else if (shouldPrint) {
        const paperSize = (settings.printerPaperSize as '58mm' | '80mm') || '80mm';
        const printItems = [
          ...fullTab.items.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price, notes: i.notes || undefined })),
          ...extraItems.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price })),
        ];
        await printOnlyReceipt({
          companyId,
          orderCode: `M${fullTab.tab_number}`,
          dailyNumber: fullTab.tab_number,
          customerName: customer,
          items: printItems,
          total: finalTotal,
          notes: `Pagamento: ${paymentName}${discount > 0 ? ` | Desconto: R$ ${discount.toFixed(2)}` : ''}${documentMode === 'sale_with_nfce' ? ' | NFC-e' : ''}`,
          paperSize,
        });
      }
      await closeTab(fullTab.id);
      toast.success('Comanda importada e fechada!');
      setImportingTab(null);
    }
  }

  /**
   * ===== Multi-payment (v1.6 beta) — Cobrar Comanda/Mesa em várias formas =====
   * Fluxo isolado: NÃO altera confirmImportTab nem confirmImportTabI9.
   * Espelha o padrão do Pedido Express:
   *  1) runMultiPayment (tudo-ou-nada com rollback automático)
   *  2) addSale UMA vez (primary)
   *  3) NFC-e com pagamentos_split (se módulo fiscal)
   *  4) closeTab
   * O link "Dividir em várias formas" só aparece quando i9Mode === '' e
   * sem activeSplit (PDVV2PaymentDialog já cuida disso).
   */
  async function handleMultiPaymentImportTab(
    lines: MultiPaymentInputLine[],
    opts: { wantsNfce: boolean },
  ) {
    if (!multiPayTab || !user || !currentRegister || !companyId) {
      toast.error('Caixa precisa estar aberto.');
      return;
    }
    const fullTab = openTabs.find((t) => t.id === multiPayTab.id);
    if (!fullTab?.items?.length) {
      toast.error('Comanda sem itens.');
      return;
    }
    setMultiPayProcessing(true);
    setMultiPayStatus('Iniciando cobranças…');
    try {
      const customer =
        fullTab.customer_name ||
        (fullTab.table?.number ? `Mesa ${fullTab.table.number}` : `Comanda ${fullTab.tab_number}`);
      const mp = await runMultiPayment({
        companyId,
        lines,
        description: `Comanda #${fullTab.tab_number} - ${customer}`,
        onStatus: setMultiPayStatus,
      });
      if (!mp.ok || !mp.primary || !mp.lines) {
        const extra = mp.rolledBackCount ? ` (${mp.rolledBackCount} cobrança(s) estornada(s))` : '';
        toast.error((mp.errorMessage || 'Cobrança recusada') + extra);
        return;
      }

      const saleItems = fullTab.items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));
      const saleId = await addSale(
        saleItems,
        mp.primary.payment_method_id,
        user.id,
        0,
        customer,
        `Comanda #${fullTab.tab_number}[MULTI] | Pagamento: ${mp.primary.payment_name}${mp.combinedNotesFragment ? ` | ${mp.combinedNotesFragment}` : ''}`,
      );
      if (!saleId) return;

      // NFC-e com pagamentos_split — só quando solicitado pelo dialog
      // (hasTef OU usuário escolheu "Venda com NFC-e").
      if (opts.wantsNfce) {
        try {
          setIsEmittingNfce(true);
          setMultiPayStatus('Emitindo NFC-e…');
          const nfceItems: NFCeItem[] = saleItems.map((it) => {
            const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
            const taxRule = product?.taxRuleId
              ? taxRules.find((tr) => tr.id === product.taxRuleId)
              : null;
            return {
              codigo: product?.code || it.product_id || 'AVULSO',
              descricao: it.product_name,
              unidade: 'UN',
              quantidade: it.quantity,
              valor_unitario: it.unit_price,
              ...buildNfceFiscalFields({ product, taxRule, mercadoEnabled }),
            };
          });
          const externalId = `TAB-MULTI-${currentRegister.id.substring(0, 8)}-${Date.now()}`;
          await emitirNFCe(companyId, saleId, {
            external_id: externalId,
            itens: nfceItems,
            valor_desconto: 0,
            valor_frete: 0,
            observacoes: fullTab.customer_name ? `Cliente: ${fullTab.customer_name}` : undefined,
            pagamentos_split: buildPagamentosSplit(mp.lines),
          } as any);
          toast.success('NFC-e enviada para processamento!');
          const { data: rec } = await supabase
            .from('nfce_records')
            .select('*')
            .eq('sale_id', saleId)
            .maybeSingle();
          if (rec) {
            setNfceRecord(rec as unknown as NFCeRecord);
            setNfceAutoPrint(false);
            setNfceDialogOpen(true);
          }
        } catch (err: any) {
          console.error('[PDVV2][TAB-MULTI] NFC-e error:', err);
          toast.error(`Venda registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`);
        } finally {
          setIsEmittingNfce(false);
        }
      }

      await closeTab(fullTab.id);
      toast.success('Comanda cobrada (multi-pagamento) e fechada!');
      setMultiPayOpen(false);
      setMultiPayTab(null);
    } catch (err: any) {
      console.error('[PDVV2][TAB-MULTI] error:', err);
      toast.error(err?.message || 'Erro na cobrança em várias formas.');
    } finally {
      setMultiPayProcessing(false);
      setMultiPayStatus('');
    }
  }

  const isI9 = true;

  function handleImportClick(tab: OccupiedTab) {
    if (!cashOpen) {
      toast.error('Abra o caixa para cobrar');
      return;
    }
    setImportingTab(tab);
  }

  async function confirmImportTabI9(params: Parameters<typeof confirmImportTab>[0] & { splitInfo?: { perPerson: number; totalPeople: number; partsToCharge?: number }; itemsInfo?: Array<{ id: string; paidQty: number }>; extraItemsInfo?: Array<{ id: string; paidQty: number }> }) {
    if (!importingTab || !user || !currentRegister || !companyId) {
      toast.error('Caixa precisa estar aberto');
      return;
    }
    const resolvedTabId = i9OriginalTabId || importingTab.id;
    const fullTab = openTabs.find((t) => t.id === resolvedTabId);

    // Split mode — resolve from params.splitInfo (first person) or i9SplitInfo (subsequent)
    let splitData = i9SplitInfo;
    if (!splitData && params.splitInfo) {
      // First person: initialize from onConfirm params (no timing issue)
      splitData = {
        perPerson: params.splitInfo.perPerson,
        remaining: params.splitInfo.totalPeople,
        total: params.splitInfo.totalPeople,
      };
      setI9OriginalTabId(importingTab.id);
      setI9SplitInfo(splitData);
    } else if (!splitData && importingTab?._splitPerson !== undefined) {
      // Fallback from enriched importingTab
      splitData = { perPerson: importingTab._splitPerPerson!, remaining: importingTab._splitTotal! - importingTab._splitPerson!, total: importingTab._splitTotal! };
      setI9SplitInfo(splitData);
    }

    if (splitData) {
      // Opção B: operador pode cobrar várias "partes" nesta transação
      // (ex.: comanda de R$100 dividida em 4 → uma pessoa paga 3 partes = R$75).
      // Limita ao restante disponível para evitar cobrar além do total.
      const requestedParts = Math.max(1, params.splitInfo?.partsToCharge ?? 1);
      const parts = Math.min(requestedParts, splitData.remaining);
      const chargeAmount = Math.round(splitData.perPerson * parts * 100) / 100;

      const customer = fullTab?.customer_name ||
        (fullTab?.table?.number ? `Mesa ${fullTab.table.number}` : importingTab.tableNumber ? `Mesa ${importingTab.tableNumber}` : `Comanda ${importingTab.tabNumber}`);
      const tabNumber = fullTab?.tab_number || importingTab.tabNumber || '?';
      const startPerson = splitData.total - splitData.remaining + 1;
      const endPerson = startPerson + parts - 1;
      const personLabel = parts > 1
        ? `Pessoas ${startPerson}-${endPerson}/${splitData.total}`
        : `Pessoa ${startPerson}/${splitData.total}`;
      const personDescr = parts > 1
        ? `Divisão ${startPerson}-${endPerson}/${splitData.total} — ${customer}`
        : `Divisão ${startPerson}/${splitData.total} — ${customer}`;
      const items = [{
        product_id: null as string | null,
        product_name: personDescr,
        quantity: 1,
        unit_price: chargeAmount,
      }];

      // ===== TEF: roda ANTES de criar a venda (igual PDV V1). Aborta se falhar.
      let tefData: NFCeTefData | undefined;
      let tefNotesFragment = '';
      if (params.tefIntegration && params.tefOptions) {
        const result = await runTefPayment({
          companyId,
          integration: params.tefIntegration,
          amount: chargeAmount,
          options: params.tefOptions,
          description: `Comanda #${tabNumber} - ${personLabel.replace('/', ' de ')}`,
          onStatus: setTefStatus,
        });
        setTefStatus('');
        if (!result.success) return;
        tefData = result.tefData;
        tefNotesFragment = result.notesFragment ? ` | ${result.notesFragment}` : '';
      }

      const saleNotes = `Comanda #${tabNumber} | ${personLabel}: ${params.paymentName}${tefNotesFragment}`;
      const saleId = await addSale(items, params.paymentMethodId, user.id, 0, customer, saleNotes);
      if (saleId) {
        // Persiste no tab para que o residual fique correto se a comanda
        // for reimportada antes de todas as pessoas pagarem:
        //  - extras adicionados durante o checkout passam a fazer parte da comanda
        //  - um item de crédito (valor negativo) registra o quanto já foi pago
        try {
          const isFirstSplitPerson = !!params.splitInfo;
          if (isFirstSplitPerson && params.extraItems?.length) {
            const extraRows = params.extraItems.map((ex) => ({
              tab_id: resolvedTabId,
              product_id: ex.product_id,
              product_name: ex.product_name,
              unit_price: ex.unit_price,
              quantity: ex.quantity,
              total_price: ex.unit_price * ex.quantity,
              notes: (ex as any).notes || null,
              created_by: user.id,
              paid: false,
            }));
            await supabase.from('tab_items').insert(extraRows as any);
          }
          await supabase.from('tab_items').insert({
            tab_id: resolvedTabId,
            product_id: null,
            product_name: `[Pago: ${personLabel}]`,
            unit_price: -chargeAmount,
            quantity: 1,
            total_price: -chargeAmount,
            created_by: user.id,
            paid: false,
          } as any);
        } catch (persistErr) {
          console.error('[PDVV2] Erro ao persistir divisão na comanda:', persistErr);
        }
        await refetchTabs();

        // NFC-e: TEF força emissão. Caso contrário, segue documentMode.
        const wantsNfce = (params.tefIntegration ? true : params.documentMode === 'sale_with_nfce') && fiscalEnabled;
        if (wantsNfce) {
          // Observação automática para NFC-e parcial de comanda (todas lojas com PDV V2)
          const isLast = (splitData.remaining - parts) <= 0;
          const personRangeText = parts > 1
            ? `pessoas ${startPerson} a ${endPerson} de ${splitData.total}`
            : `pessoa ${startPerson} de ${splitData.total}`;
          const partialObs = isLast
            ? `Pagamento final da Comanda #${tabNumber} (${personRangeText}). Comanda quitada.`
            : `Pagamento parcial da Comanda #${tabNumber} - ${personRangeText}. Saldo restante segue em aberto na comanda.`;
          await emitNFCeAndOpenDialog({
            saleId,
            items,
            discount: 0,
            customerName: fullTab?.customer_name || null,
            shouldPrint: params.printDocument !== false,
            tefData,
            customerDocument: params.customerDocument,
            extraObservacoes: partialObs,
          });
        }

        const newRemaining = splitData.remaining - parts;
        if (newRemaining <= 0) {
          await closeTab(resolvedTabId);
          toast.success(parts > 1
            ? `Últimas ${parts} pessoas cobradas — comanda fechada!`
            : 'Última pessoa cobrada — comanda fechada!');
          setI9SplitInfo(null);
          setI9OriginalTabId(null);
          setImportingTab(null);
        } else {
          toast.success(parts > 1
            ? `Pessoas ${startPerson}-${endPerson} cobradas. Faltam ${newRemaining}.`
            : `Pessoa ${startPerson} cobrada. Faltam ${newRemaining}.`);
          setI9SplitInfo({ ...splitData, remaining: newRemaining });
          const savedTab = { ...importingTab, id: resolvedTabId };
          i9SplitTransitionRef.current = true;
          setImportingTab(null);
          setTimeout(() => {
            // Enriquece o importingTab com snapshot do split — fallback caso
            // i9SplitInfo seja zerado por algum reset entre pagamentos.
            setImportingTab({
              ...savedTab,
              total: splitData.perPerson,
              _splitPerson: splitData.total - newRemaining,
              _splitTotal: splitData.total,
              _splitPerPerson: splitData.perPerson,
            } as any);
            i9SplitTransitionRef.current = false;
          }, 100);
        }
      }
      return;
    }

    if (!fullTab?.items?.length) {
      toast.error('Comanda sem itens');
      return;
    }
    const customer =
      fullTab.customer_name ||
      (fullTab.table?.number ? `Mesa ${fullTab.table.number}` : `Comanda ${fullTab.tab_number}`);

    // ===== Items mode: selected items with TEF + NFC-e + loop =====
    const selectedExtraItemsInfo = params.extraItemsInfo || [];
    if ((params.itemsInfo && params.itemsInfo.length > 0) || selectedExtraItemsInfo.length > 0) {
      const tabNumber = fullTab.tab_number || importingTab.tabNumber || '?';

      // Build sale items from selected tab_items
      const saleItems: { product_id: string | null; product_name: string; quantity: number; unit_price: number }[] = [];
      for (const pi of params.itemsInfo || []) {
        const tabItem = fullTab.items.find((i) => i.id === pi.id);
        if (!tabItem) continue;
        saleItems.push({
          product_id: tabItem.product_id,
          product_name: tabItem.product_name,
          quantity: pi.paidQty,
          unit_price: tabItem.unit_price,
        });
      }
      for (const pi of selectedExtraItemsInfo) {
        const extra = (params.extraItems || []).find((i: any) => i.id === pi.id);
        if (!extra || pi.paidQty <= 0) continue;
        saleItems.push({
          product_id: extra.product_id,
          product_name: extra.product_name,
          quantity: Math.min(pi.paidQty, extra.quantity),
          unit_price: extra.unit_price,
        });
      }
      if (saleItems.length === 0) { toast.error('Nenhum item selecionado'); return; }

      // ===== TEF: roda ANTES de criar a venda. Aborta se falhar.
      let tefData: NFCeTefData | undefined;
      let tefNotesFragment = '';
      if (params.tefIntegration && params.tefOptions) {
        const result = await runTefPayment({
          companyId,
          integration: params.tefIntegration,
          amount: params.finalTotal,
          options: params.tefOptions,
          description: `Comanda #${tabNumber} - Itens selecionados`,
          onStatus: setTefStatus,
        });
        setTefStatus('');
        if (!result.success) return;
        tefData = result.tefData;
        tefNotesFragment = result.notesFragment ? ` | ${result.notesFragment}` : '';
      }

      const saleNotes = `Comanda #${tabNumber} | Pagamento parcial: ${params.paymentName}${tefNotesFragment}`;
      const saleId = await addSale(saleItems, params.paymentMethodId, user.id, 0, customer, saleNotes);

      if (saleId) {
        // DB: mark items as paid (full or partial qty split)
        const fullPayIds: string[] = [];
        const partialPays: Array<{ id: string; paidQty: number }> = [];
        for (const pi of params.itemsInfo || []) {
          const tabItem = fullTab.items.find((i) => i.id === pi.id);
          if (!tabItem) continue;
          if (pi.paidQty >= tabItem.quantity) {
            fullPayIds.push(pi.id);
          } else {
            partialPays.push(pi);
          }
        }
        if (fullPayIds.length > 0) {
          await supabase.from('tab_items').update({ paid: true } as any).in('id', fullPayIds);
        }
        for (const pp of partialPays) {
          const tabItem = fullTab.items.find((i) => i.id === pp.id);
          if (!tabItem) continue;
          // Frações (rachar item): arredondar quantidades em 3 casas e totais em 2
          // para evitar dízimas em colunas numeric.
          const remainingQty = Math.round((tabItem.quantity - pp.paidQty) * 1000) / 1000;
          const remainingTotal = Math.round(remainingQty * tabItem.unit_price * 100) / 100;
          const paidQtyRounded = Math.round(pp.paidQty * 1000) / 1000;
          const paidTotal = Math.round(paidQtyRounded * tabItem.unit_price * 100) / 100;
          await supabase.from('tab_items').update({
            quantity: remainingQty,
            total_price: remainingTotal,
          } as any).eq('id', pp.id);
          await supabase.from('tab_items').insert({
            tab_id: tabItem.tab_id,
            product_id: tabItem.product_id,
            product_name: tabItem.product_name,
            unit_price: tabItem.unit_price,
            quantity: paidQtyRounded,
            total_price: paidTotal,
            created_by: tabItem.created_by,
            notes: tabItem.notes,
            paid: true,
          } as any);
        }
        if (params.extraItems?.length) {
          const selectedExtraQtyById = new Map(selectedExtraItemsInfo.map((i) => [i.id, i.paidQty]));
          const extraRows = params.extraItems.flatMap((ex: any) => {
            const paidQty = Math.min(selectedExtraQtyById.get(ex.id) || 0, ex.quantity);
            const rows = [] as any[];
            if (paidQty > 0) {
              rows.push({
                tab_id: fullTab.id,
                product_id: ex.product_id,
                product_name: ex.product_name,
                unit_price: ex.unit_price,
                quantity: paidQty,
                total_price: paidQty * ex.unit_price,
                notes: ex.notes || null,
                created_by: user.id,
                paid: true,
              });
            }
            const remainingQty = ex.quantity - paidQty;
            if (remainingQty > 0) {
              rows.push({
                tab_id: fullTab.id,
                product_id: ex.product_id,
                product_name: ex.product_name,
                unit_price: ex.unit_price,
                quantity: remainingQty,
                total_price: remainingQty * ex.unit_price,
                notes: ex.notes || null,
                created_by: user.id,
                paid: false,
              });
            }
            return rows;
          });
          if (extraRows.length > 0) await supabase.from('tab_items').insert(extraRows as any);
        }
        await refetchTabs();

        // NFC-e: TEF força emissão. Caso contrário, segue documentMode.
        const wantsNfce = (params.tefIntegration ? true : params.documentMode === 'sale_with_nfce') && fiscalEnabled;
        if (wantsNfce) {
          // Observação automática para NFC-e parcial de comanda (todas lojas com PDV V2)
          // Pré-cálculo de "todos pagos" para decidir se é a última nota da comanda
          const fullyPaidIdsPre = new Set(
            (params.itemsInfo || [])
              .filter((pi) => {
                const ti = fullTab.items.find((i) => i.id === pi.id);
                return ti && pi.paidQty >= ti.quantity;
              })
              .map((pi) => pi.id)
          );
          const hasUnpaidExtraRemainderPre = (params.extraItems || []).some((ex: any) => {
            const paidQty = selectedExtraItemsInfo.find((i) => i.id === ex.id)?.paidQty || 0;
            return paidQty < ex.quantity;
          });
          const allPaidPre = fullTab.items.every((i) =>
            (i as any).paid || fullyPaidIdsPre.has(i.id)
          ) && !hasUnpaidExtraRemainderPre;
          const partialObs = allPaidPre
            ? `Pagamento final da Comanda #${tabNumber}. Comanda quitada.`
            : `Pagamento parcial de itens da Comanda #${tabNumber}. Demais itens permanecem em aberto na comanda.`;
          await emitNFCeAndOpenDialog({
            saleId,
            items: saleItems,
            discount: 0,
            customerName: fullTab.customer_name || null,
            shouldPrint: params.printDocument !== false,
            tefData,
            customerDocument: params.customerDocument,
            extraObservacoes: partialObs,
          });
        }

        // Check if all items are now paid
        // Only consider fully-paid items (not partial qty) as done
        const fullyPaidIds = new Set(fullPayIds);
        const hasUnpaidExtraRemainder = (params.extraItems || []).some((ex: any) => {
          const paidQty = selectedExtraItemsInfo.find((i) => i.id === ex.id)?.paidQty || 0;
          return paidQty < ex.quantity;
        });
        const allPaid = fullTab.items.every((i) =>
          (i as any).paid || fullyPaidIds.has(i.id)
        ) && !hasUnpaidExtraRemainder;
        if (allPaid) {
          await closeTab(fullTab.id);
          toast.success('Todos os itens pagos — comanda fechada!');
          setImportingTab(null);
        } else {
          toast.success('Pagamento parcial registrado! Selecione os próximos itens.');
          // Loop back: reopen dialog for remaining items
          const savedTab = { ...importingTab, id: resolvedTabId };
          i9SplitTransitionRef.current = true;
          setImportingTab(null);
          setTimeout(() => {
            setImportingTab(savedTab);
            i9SplitTransitionRef.current = false;
          }, 100);
        }
      }
      return;
    }

    await confirmImportTab(params);
  }

  async function handleCloseCash(closingAmount: number, notes: string) {
    if (!user) return;
    await closeRegister(closingAmount, user.id, notes);
  }

  async function handleChangeSalePaymentMethod(saleId: string, paymentMethodId: string) {
    try {
      const { error } = await supabase
        .from('pdv_sales')
        .update({ payment_method_id: paymentMethodId })
        .eq('id', saleId);
      if (error) throw error;
      toast.success('Forma de pagamento atualizada');
      await refetchCash();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao atualizar forma de pagamento');
    }
  }

  return (
    <>
    <PDVV2Layout>
      <div className="flex h-full min-h-0 flex-col">
        <PDVV2TopBar
          storeName={company?.name || 'Loja'}
          cashOpen={cashOpenForDisplay}
          cashStateUnknown={cashStateUnknown}
          cashAmount={cashAmount}
          showCashAmount={showCash}
          onToggleCashAmount={() => setShowCash((v) => !v)}
          onCloseCash={() => setCloseOpen(true)}
          onNewOrder={() => setNewOrderOpen(true)}
          companyId={company?.id}
        />

        {cashStateUnknown ? (
          <div className="flex-1" />
        ) : !cashOpenForDisplay ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            <Card className="max-w-md w-full">
              <CardContent className="py-10 flex flex-col items-center text-center gap-4">
                <div className="rounded-full bg-destructive/10 p-4">
                  <Lock className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Caixa Fechado</h2>
                  <p className="text-sm text-muted-foreground">
                    Para acessar o PDV e iniciar as vendas, abra o caixa primeiro.
                  </p>
                </div>
                <Button size="lg" className="gap-2" onClick={() => setOpenCashOpen(true)}>
                  <Unlock className="h-4 w-4" />
                  Abrir Caixa
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : tablesEnabled ? (
          !storageHydrated ? (
            <div className="flex-1" />
          ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'orders' | 'tables')}
            className="flex-1 flex min-h-0 flex-col overflow-hidden"
          >
            <div className="px-4 pt-3 pb-0">
              <TabsList>
                <TabsTrigger value="orders" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Pedidos
                </TabsTrigger>
                <TabsTrigger value="tables" className="gap-2">
                  <UtensilsCrossed className="h-4 w-4" />
                  Mesas
                  {occupiedTabs.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                      {occupiedTabs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="orders" className="mt-3 hidden min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex">
              <PDVV2SummaryCards
                pending={counts.pending}
                preparing={counts.preparing}
                ready={counts.ready}
                delivered={counts.delivered}
                total={counts.all}
                revenue={revenue}
                showRevenue={showRevenue}
                onToggleRevenue={() => setShowRevenue((v) => !v)}
              />
              <PDVV2StatusFilters active={filter} onChange={setFilter} counts={counts} />
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                {filteredOrders.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      Nenhum pedido neste filtro.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-min items-start gap-3 pb-4">
                    {filteredOrders.map((o) => {
                      const ready = o.status === 'ready';
                      const isDel = isDelivery(o);
                      const showCobrar = ready && !isDel;
                      const alreadyCharged = !!o.notes?.includes('[COBRADO]');
                      const hideBtnAdvance = chargeBeforeDeliverEnabled && showCobrar && !alreadyCharged;
                        return (
                          <div key={o.id} className="space-y-2">
                            <OrderCard
                              order={o}
                              paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
                              storeName={company?.name}
                              disableAdvance={hideBtnAdvance}
                              disableAdvanceReason="Finalize o pagamento em 'Cobrar' antes de entregar"
                              hideAdvance={hideBtnAdvance}
                              onCharged={refetchOrders}
                            />
                          </div>
                        );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tables" className="hidden !mt-0 min-h-0 flex-1 flex-col overflow-hidden pt-3 data-[state=active]:flex data-[state=active]:!mt-0">
              <PDVV2TablesSummaryCards
                occupiedTables={tablesMetrics.occupiedTables}
                openTabs={tablesMetrics.openTabsCount}
                closedToday={tablesMetrics.closedToday}
                revenueToday={tablesMetrics.revenueToday}
                showRevenue={showTablesRevenue}
                onToggleRevenue={() => setShowTablesRevenue((v) => !v)}
                onOpenClosedTabs={() => setClosedTabsOpen(true)}
              />
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                <PDVV2TablesGrid
                  tabs={occupiedTabs}
                  onImport={handleImportClick}
                  onDelete={async (tab) => {
                    if (!window.confirm(
                      tab.tableNumber
                        ? `Excluir a comanda da Mesa ${tab.tableNumber}? Esta ação não pode ser desfeita.`
                        : `Excluir a Comanda #${tab.tabNumber}? Esta ação não pode ser desfeita.`
                    )) return;
                    await deleteTab(tab.id);
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
          )
        ) : (
          <>
            <PDVV2SummaryCards
              pending={counts.pending}
              preparing={counts.preparing}
              ready={counts.ready}
              delivered={counts.delivered}
              total={counts.all}
              revenue={revenue}
              showRevenue={showRevenue}
              onToggleRevenue={() => setShowRevenue((v) => !v)}
            />
            <PDVV2StatusFilters active={filter} onChange={setFilter} counts={counts} />
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
              {filteredOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    Nenhum pedido neste filtro.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-min items-start gap-3 pb-4">
                  {filteredOrders.map((o) => {
                    const ready = o.status === 'ready';
                    const isDel = isDelivery(o);
                    const showCobrar = ready && !isDel;
                   const alreadyCharged = !!o.notes?.includes('[COBRADO]');
                   const hideBtnAdvance = chargeBeforeDeliverEnabled && showCobrar && !alreadyCharged;
                    return (
                      <div key={o.id} className="space-y-2">
                        <OrderCard
                          order={o}
                          paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
                          storeName={company?.name}
                          disableAdvance={hideBtnAdvance}
                          disableAdvanceReason="Finalize o pagamento em 'Cobrar' antes de entregar"
                          hideAdvance={hideBtnAdvance}
                          onCharged={refetchOrders}
                         />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <PedidoExpressDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} />

      <PDVV2CloseCashDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        companyId={companyId}
        companyName={company?.name}
        paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
        expectedAmount={cashAmount}
        sales={closeCashSales}
        paymentMethods={activePaymentMethods.map((p) => ({ id: p.id, name: p.name }))}
        deliveryPaymentMethods={menuPaymentMethods.map((p) => ({ id: p.id, name: p.name }))}
        onChangeSalePaymentMethod={handleChangeSalePaymentMethod}
        onConfirm={handleCloseCash}
      />


      <PDVV2PaymentDialog
        open={!!importingTab}
        onOpenChange={(o) => {
          if (!o) {
            setImportingTab(null);
            setI9PartialItemIds([]);
            if (!i9SplitTransitionRef.current) {
              setI9SplitInfo(null);
              setI9OriginalTabId(null);
            }
          }
        }}
        companyId={companyId}
        total={importingTab?.total || 0}
        title={
          i9SplitInfo
            ? `Pessoa ${i9SplitInfo.total - i9SplitInfo.remaining + 1} de ${i9SplitInfo.total}`
            : importingTab?.tableNumber
            ? `Cobrar Mesa ${importingTab.tableNumber}`
            : `Cobrar Comanda ${importingTab?.tabNumber}`
        }
        showDocumentMode
        showAddItem={!isI9 || (!i9PartialItemIds.length && !i9SplitInfo)}
        tefStatus={tefStatus}
        onConfirm={isI9 ? confirmImportTabI9 : confirmImportTab}
        onSplitPayments={() => {
          // Fecha o checkout single-payment e abre o multi-pagamento
          // mantendo a comanda selecionada. NÃO toca em TEF v1.1 / split I9.
          if (importingTab) {
            setMultiPayTab(importingTab);
            setImportingTab(null);
            setMultiPayOpen(true);
          }
        }}
        activeSplit={i9SplitInfo ? {
          perPerson: i9SplitInfo.perPerson,
          totalPeople: i9SplitInfo.total,
          currentPerson: i9SplitInfo.total - i9SplitInfo.remaining + 1,
        } : undefined}
        checkoutItems={isI9 && importingTab ? openTabs.find(t => t.id === (i9OriginalTabId || importingTab.id))?.items?.map(i => ({ name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, id: i.id, paid: !!(i as any).paid })) : undefined}
        transferLog={importingTab ? (openTabs.find(t => t.id === (i9OriginalTabId || importingTab.id))?.transfer_log as any) || undefined : undefined}
      />

      <PDVV2SequentialPaymentDialog
        open={multiPayOpen}
        onOpenChange={(o) => {
          setMultiPayOpen(o);
          if (!o && !multiPayProcessing) setMultiPayTab(null);
        }}
        companyId={companyId}
        total={multiPayTab?.total || 0}
        fiscalEnabled={fiscalEnabled}
        cashRegisterId={currentRegister?.id}
        contextKey={multiPayTab ? `tab:${multiPayTab.id}` : undefined}
        contextLabel={
          multiPayTab?.tableNumber
            ? `Mesa ${multiPayTab.tableNumber}`
            : `Comanda ${multiPayTab?.tabNumber || ''}`
        }
        title={
          multiPayTab?.tableNumber
            ? `Dividir formas — Mesa ${multiPayTab.tableNumber}`
            : `Dividir formas — Comanda ${multiPayTab?.tabNumber || ''}`
        }
        processingStatus={multiPayStatus}
        processing={multiPayProcessing}
        onConfirm={handleMultiPaymentImportTab}
      />

      <PDVV2ClosedTabsDialog
        open={closedTabsOpen}
        onOpenChange={setClosedTabsOpen}
        sales={closedTabSales}
        companyId={companyId}
        paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
        onSaleDeleted={refetchCash}
      />

      <PDVV2NFCePostSaleDialog
        open={nfceDialogOpen}
        onOpenChange={setNfceDialogOpen}
        companyId={companyId}
        initialRecord={nfceRecord}
        autoPrint={nfceAutoPrint}
        onClosed={async () => {
          // Executa a ação adiada (fechar comanda / marcar pedido como entregue)
          if (pendingPostSale) {
            try {
              await pendingPostSale();
            } catch (e) {
              console.error('[PDVV2] post-sale action error:', e);
            }
          }
          setPendingPostSale(null);
          setNfceRecord(null);
        }}
      />

      <Dialog open={openCashOpen} onOpenChange={setOpenCashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Caixa</DialogTitle>
            <DialogDescription>
              Informe o valor de abertura (troco inicial). Use 0 se não houver troco.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="opening-amount">Valor de abertura (R$)</Label>
            <Input
              id="opening-amount"
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
            <Button variant="outline" onClick={() => setOpenCashOpen(false)}>
              Cancelar
            </Button>
            <Button
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
              Abrir Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PDVV2Layout>
    {/* Overlay de bloqueio enquanto NFC-e é emitida */}
    {/* Na Lancheria I9 trocamos o overlay bloqueante por um indicador
        discreto no canto, para não sobrepor o prompt de impressão TEF. */}
    {isEmittingNfce && isI9Company && (
      <div className="fixed bottom-4 right-4 z-40 bg-card border rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 pointer-events-none">
        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        <p className="text-sm font-medium text-foreground">Emitindo NFC-e…</p>
      </div>
    )}
    {isEmittingNfce && !isI9Company && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
        <div className="bg-card rounded-lg px-8 py-6 shadow-xl flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-lg font-semibold text-foreground">Emitindo NFC-e…</p>
          <p className="text-sm text-muted-foreground">Aguarde, não feche a tela.</p>
        </div>
      </div>
    )}
    </>
  );
}
