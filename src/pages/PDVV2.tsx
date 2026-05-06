import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useOrderContext } from '@/contexts/OrderContext';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useTabs } from '@/hooks/useTabs';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
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
import { PDVV2OrderOriginBadge } from '@/components/pdv-v2/PDVV2OrderOriginBadge';
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
import { LANCHERIA_I9_COMPANY_ID } from '@/components/pdv-v2/_format';

function isDelivery(o: Order) {
  return !!o.deliveryAddress && o.deliveryAddress.trim().length > 0;
}

export default function PDVV2() {
  const { company, user } = useAuthContext();
  const companyId = company?.id;
  const { isModuleEnabled } = useCompanyModules({ companyId });
  const tablesEnabled = isModuleEnabled('mesas');

  const { orders, updateOrderStatus } = useOrderContext();
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
  } = useCashRegister({ companyId });
  const { openTabs, getTabTotal, closeTab } = useTabs({ companyId });
  const { settings } = useStoreSettings({ companyId });
  const { activePaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });
  const { products } = useProducts({ companyId });
  const { taxRules } = useTaxRules({ companyId });
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
  const [chargeOrder, setChargeOrder] = useState<Order | null>(null);
  const [importingTab, setImportingTab] = useState<(OccupiedTab & { _splitPerson?: number; _splitTotal?: number; _splitPerPerson?: number }) | null>(null);
  const [closedTabsOpen, setClosedTabsOpen] = useState(false);
  const [i9PartialItemIds, setI9PartialItemIds] = useState<string[]>([]);
  const [i9SplitInfo, setI9SplitInfo] = useState<{ perPerson: number; remaining: number; total: number } | null>(null);
  const [i9OriginalTabId, setI9OriginalTabId] = useState<string | null>(null);
  // NFC-e pós-venda (mesmo padrão do PDV V1: polling visível + ação do operador)
  const [nfceDialogOpen, setNfceDialogOpen] = useState(false);
  const [nfceRecord, setNfceRecord] = useState<NFCeRecord | null>(null);
  const [nfceAutoPrint, setNfceAutoPrint] = useState(false);
  const [pendingPostSale, setPendingPostSale] = useState<null | (() => void | Promise<void>)>(null);
  // Status do processamento TEF (banner no topo do diálogo de cobrança)
  const [tefStatus, setTefStatus] = useState('');

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: orders.length,
      pending: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
    };
    for (const o of orders) c[o.status as OrderStatus]++;
    return c;
  }, [orders]);

  // Faturamento real = vendas pagas no caixa atual (pdv_sales)
  const revenue = totalSales;

  const filteredOrders = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  const occupiedTabs: OccupiedTab[] = useMemo(
    () =>
      openTabs.map((t) => ({
        id: t.id,
        tabNumber: t.tab_number,
        tableNumber: t.table?.number ?? null,
        customerName: t.customer_name,
        total: getTabTotal(t),
      })),
    [openTabs, getTabTotal]
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

  const cashAmount = (currentRegister?.opening_amount || 0) + totalSales;
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
    return sales.map((s) => {
      // Determina origem cruzando com orders (quando há order_id)
      let origin: CloseCashSale['origin'] = 'balcao';
      const orderId = (s as any).order_id as string | undefined;
      if (orderId) {
        const linked = orders.find((o) => o.id === orderId);
        if (linked) {
          if (linked.origin === 'mesa') origin = 'mesa';
          else if (linked.origin === 'balcao') origin = 'balcao';
          else origin = isDelivery(linked) ? 'cardapio_delivery' : 'cardapio_retirada';
        } else {
          origin = 'outros';
        }
      } else {
        // Sem order vinculado — venda balcão direta
        // ou comanda importada (notes contém "Comanda")
        if (s.notes?.toLowerCase().includes('comanda')) origin = 'mesa';
        else origin = 'balcao';
      }

      return {
        id: s.id,
        final_total: Number(s.final_total) || 0,
        payment_method_id: s.payment_method_id || null,
        payment_method_name: s.payment_method?.name || 'Sem forma',
        customer_name: s.customer_name || null,
        created_at: s.created_at,
        origin,
      };
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

  function handleChargeFromOrder(order: Order) {
    if (!cashOpen) {
      toast.error('Abra o caixa para cobrar');
      return;
    }
    setChargeOrder(order);
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
  }): Promise<boolean> {
    const { saleId, items, discount, customerName, shouldPrint, tefData, customerDocument } = args;
    if (!companyId || !currentRegister) return false;
    try {
      const nfceItems: NFCeItem[] = items.map((it) => {
        const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
        const taxRule = product?.taxRuleId ? taxRules.find((tr) => tr.id === product.taxRuleId) : null;
        return {
          codigo: it.product_id || 'AVULSO',
          descricao: it.product_name,
          ncm: taxRule?.ncm || '00000000',
          cfop: taxRule?.cfop || '5102',
          unidade: product?.unit || 'UN',
          quantidade: it.quantity,
          valor_unitario: it.unit_price,
          csosn: taxRule?.csosn || '102',
          aliquota_icms: taxRule?.icms_aliquot || 0,
          cst_pis: taxRule?.pis_cst || '49',
          aliquota_pis: taxRule?.pis_aliquot || 0,
          cst_cofins: taxRule?.cofins_cst || '49',
          aliquota_cofins: taxRule?.cofins_aliquot || 0,
        };
      });

      const externalId = `PDVV2-${currentRegister.id.substring(0, 8)}-${Date.now()}`;
      const cleanDoc = (customerDocument || '').replace(/\D/g, '');
      const destinatario = cleanDoc.length === 11
        ? { cpf: cleanDoc, nome: customerName || undefined }
        : cleanDoc.length === 14
          ? { cnpj: cleanDoc, nome: customerName || undefined }
          : undefined;
      await emitirNFCe(companyId, saleId, {
        external_id: externalId,
        itens: nfceItems,
        valor_desconto: discount || 0,
        valor_frete: 0,
        observacoes: customerName ? `Cliente: ${customerName}` : undefined,
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
        setNfceDialogOpen(true);
      }
      return true;
    } catch (err: any) {
      console.error('[PDVV2] NFC-e emission error:', err);
      toast.error(`Venda registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`);
      return false;
    }
  }

  async function confirmChargeOrder({
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
    if (!chargeOrder || !user || !currentRegister) {
      toast.error('Caixa precisa estar aberto');
      return;
    }
    const baseItems = chargeOrder.items.map((i) => ({
      product_id: i.productId || null,
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
    }));
    const items = [...baseItems, ...extraItems.map(({ product_id, product_name, quantity, unit_price }) => ({ product_id, product_name, quantity, unit_price }))];

    // ===== TEF: roda ANTES de criar a venda (igual PDV V1). Aborta se falhar.
    let tefData: NFCeTefData | undefined;
    let tefNotesFragment = '';
    if (tefIntegration && tefOptions && companyId) {
      const result = await runTefPayment({
        companyId,
        integration: tefIntegration,
        amount: finalTotal,
        options: tefOptions,
        description: chargeOrder.customerName ? `Venda - ${chargeOrder.customerName}` : 'Venda PDV',
        onStatus: setTefStatus,
      });
      setTefStatus('');
      if (!result.success) return; // toast já exibido pelo helper
      tefData = result.tefData;
      tefNotesFragment = result.notesFragment ? ` | ${result.notesFragment}` : '';
    }

    const saleId = await addSale(
      items,
      paymentMethodId,
      user.id,
      discount,
      chargeOrder.customerName,
      `Pedido #${chargeOrder.dailyNumber} | Pagamento: ${paymentName}${tefNotesFragment}`,
      chargeOrder.id
    );
    if (saleId) {
      // NFC-e: TEF força emissão (regra V1). Caso contrário, segue documentMode.
      const wantsNfce = (tefIntegration ? true : documentMode === 'sale_with_nfce') && fiscalEnabled && companyId;
      if (wantsNfce) {
        // Marca o pedido como entregue só depois que o operador autorizar o
        // fechamento do pop-up de NFC-e (autorizada/rejeitada).
        const orderIdToFinish = chargeOrder.id;
        setPendingPostSale(() => async () => {
          await updateOrderStatus(orderIdToFinish, 'delivered');
          toast.success('Cobrança registrada!');
        });
        const ok = await emitNFCeAndOpenDialog({
          saleId,
          items,
          discount,
          customerName: chargeOrder.customerName,
          shouldPrint: !!printDocument,
          tefData,
          customerDocument,
        });
        if (!ok) {
          // Falhou ao emitir → fecha como venda comum para não travar o caixa
          await updateOrderStatus(chargeOrder.id, 'delivered');
          setPendingPostSale(null);
        }
        setChargeOrder(null);
        return;
      } else if (printDocument && companyId) {
        const paperSize = (settings.printerPaperSize as '58mm' | '80mm') || '80mm';
        const printItems = [
          ...chargeOrder.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, notes: i.notes || undefined })),
          ...extraItems.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price })),
        ];
        await printOnlyReceipt({
          companyId,
          orderCode: chargeOrder.orderCode,
          dailyNumber: chargeOrder.dailyNumber || 0,
          customerName: chargeOrder.customerName,
          items: printItems,
          total: finalTotal,
          notes: `Pagamento: ${paymentName}${discount > 0 ? ` | Desconto: R$ ${discount.toFixed(2)}` : ''}${documentMode === 'sale_with_nfce' ? ' | NFC-e' : ''}`,
          paperSize,
        });
      }
      await updateOrderStatus(chargeOrder.id, 'delivered');
      toast.success('Cobrança registrada!');
      setChargeOrder(null);
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
        // Mesma regra do confirmChargeOrder: só fecha a comanda depois que o
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

  const isI9 = companyId === LANCHERIA_I9_COMPANY_ID;

  function handleImportClick(tab: OccupiedTab) {
    if (!cashOpen) {
      toast.error('Abra o caixa para cobrar');
      return;
    }
    setImportingTab(tab);
  }

  async function confirmImportTabI9(params: Parameters<typeof confirmImportTab>[0] & { splitInfo?: { perPerson: number; totalPeople: number } }) {
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
      const customer = fullTab?.customer_name ||
        (fullTab?.table?.number ? `Mesa ${fullTab.table.number}` : importingTab.tableNumber ? `Mesa ${importingTab.tableNumber}` : `Comanda ${importingTab.tabNumber}`);
      const tabNumber = fullTab?.tab_number || importingTab.tabNumber || '?';
      const personIndex = splitData.total - splitData.remaining + 1;
      const items = [{
        product_id: null as string | null,
        product_name: `Divisão ${personIndex}/${splitData.total} — ${customer}`,
        quantity: 1,
        unit_price: splitData.perPerson,
      }];

      // ===== TEF: roda ANTES de criar a venda (igual PDV V1). Aborta se falhar.
      let tefData: NFCeTefData | undefined;
      let tefNotesFragment = '';
      if (params.tefIntegration && params.tefOptions) {
        const result = await runTefPayment({
          companyId,
          integration: params.tefIntegration,
          amount: splitData.perPerson,
          options: params.tefOptions,
          description: `Comanda #${tabNumber} - Divisão ${personIndex}/${splitData.total}`,
          onStatus: setTefStatus,
        });
        setTefStatus('');
        if (!result.success) return;
        tefData = result.tefData;
        tefNotesFragment = result.notesFragment ? ` | ${result.notesFragment}` : '';
      }

      const saleNotes = `Comanda #${tabNumber} | Divisão ${personIndex}/${splitData.total}: ${params.paymentName}${tefNotesFragment}`;
      const saleId = await addSale(items, params.paymentMethodId, user.id, 0, customer, saleNotes);
      if (saleId) {
        // NFC-e: TEF força emissão. Caso contrário, segue documentMode.
        const wantsNfce = (params.tefIntegration ? true : params.documentMode === 'sale_with_nfce') && fiscalEnabled;
        if (wantsNfce) {
          await emitNFCeAndOpenDialog({
            saleId,
            items,
            discount: 0,
            customerName: fullTab?.customer_name || null,
            shouldPrint: params.printDocument !== false,
            tefData,
            customerDocument: params.customerDocument,
          });
        }

        const newRemaining = splitData.remaining - 1;
        if (newRemaining <= 0) {
          await closeTab(resolvedTabId);
          toast.success('Última pessoa cobrada — comanda fechada!');
          setI9SplitInfo(null);
          setI9OriginalTabId(null);
          setImportingTab(null);
        } else {
          toast.success(`Pessoa ${personIndex} cobrada. Faltam ${newRemaining}.`);
          setI9SplitInfo({ ...splitData, remaining: newRemaining });
          const savedTab = { ...importingTab, id: resolvedTabId };
          setImportingTab(null);
          setTimeout(() => setImportingTab({ ...savedTab, total: splitData.perPerson }), 100);
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

    if (i9PartialItemIds.length > 0) {
      const selectedItems = fullTab.items.filter((i) => i9PartialItemIds.includes(i.id));
      if (selectedItems.length === 0) { toast.error('Nenhum item selecionado'); return; }
      const items = selectedItems.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));
      const saleId = await addSale(items, params.paymentMethodId, user.id, 0, customer,
        `Comanda #${fullTab.tab_number} | Pagamento parcial: ${params.paymentName}`);
      if (saleId) {
        await supabase.from('tab_items').update({ paid: true } as any).in('id', i9PartialItemIds);
        const allPaid = fullTab.items.every((i) => i.paid || i9PartialItemIds.includes(i.id));
        if (allPaid) {
          await closeTab(fullTab.id);
          toast.success('Todos os itens pagos — comanda fechada!');
        } else {
          toast.success('Pagamento parcial registrado!');
        }
      }
      setI9PartialItemIds([]);
      setImportingTab(null);
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
                        return (
                          <div key={o.id} className="space-y-2">
                            <OrderCard
                              order={o}
                              paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
                              storeName={company?.name}
                              headerExtra={<PDVV2OrderOriginBadge origin={o.origin} />}
                              disableAdvance={showCobrar}
                              disableAdvanceReason="Finalize o pagamento em 'Cobrar' antes de entregar"
                            />
                            {showCobrar && (
                              <Button
                                size="sm"
                                className="w-full"
                                onClick={() => handleChargeFromOrder(o)}
                              >
                                <CreditCard className="h-4 w-4 mr-1" />
                                Cobrar
                              </Button>
                            )}
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
                <PDVV2TablesGrid tabs={occupiedTabs} onImport={handleImportClick} />
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
                    return (
                      <div key={o.id} className="space-y-2">
                        <OrderCard
                          order={o}
                          paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
                          storeName={company?.name}
                          headerExtra={<PDVV2OrderOriginBadge origin={o.origin} />}
                          disableAdvance={showCobrar}
                          disableAdvanceReason="Finalize o pagamento em 'Cobrar' antes de entregar"
                        />
                        {showCobrar && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => handleChargeFromOrder(o)}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            Cobrar
                          </Button>
                        )}
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
        expectedAmount={cashAmount}
        sales={closeCashSales}
        paymentMethods={activePaymentMethods.map((p) => ({ id: p.id, name: p.name }))}
        onChangeSalePaymentMethod={handleChangeSalePaymentMethod}
        onConfirm={handleCloseCash}
      />

      <PDVV2PaymentDialog
        open={!!chargeOrder}
        onOpenChange={(o) => !o && setChargeOrder(null)}
        companyId={companyId}
        total={chargeOrder?.total || 0}
        title={`Cobrar pedido #${chargeOrder?.dailyNumber}`}
        showDocumentMode
        showAddItem={!!chargeOrder && !isDelivery(chargeOrder)}
        tefStatus={tefStatus}
        onConfirm={confirmChargeOrder}
        checkoutItems={isI9 ? chargeOrder?.items?.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.price })) : undefined}
      />

      <PDVV2PaymentDialog
        open={!!importingTab}
        onOpenChange={(o) => {
          if (!o) {
            setImportingTab(null);
            setI9PartialItemIds([]);
            setI9SplitInfo(null);
            setI9OriginalTabId(null);
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
        checkoutItems={isI9 && importingTab ? openTabs.find(t => t.id === (i9OriginalTabId || importingTab.id))?.items?.map(i => ({ name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, id: i.id, paid: !!(i as any).paid })) : undefined}
        onItemsPaid={isI9 ? async (itemIds) => {
          if (!importingTab) return;
          await supabase.from('tab_items').update({ paid: true } as any).in('id', itemIds);
          const fullTab = openTabs.find(t => t.id === importingTab.id);
          if (!fullTab?.items) return;
          const allPaid = fullTab.items.every(i => (i as any).paid || itemIds.includes(i.id));
          if (allPaid) {
            await closeTab(fullTab.id);
            toast.success('Todos os itens pagos — comanda fechada!');
          } else {
            toast.success('Pagamento parcial registrado!');
          }
          setImportingTab(null);
        } : undefined}
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
  );
}
