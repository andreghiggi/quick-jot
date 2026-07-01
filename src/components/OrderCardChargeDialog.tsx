import { useEffect, useRef, useState, useMemo } from 'react';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import type { DocumentMode } from '@/components/pdv-v2/PDVV2DocumentModeSelector';
import { PDVV2NFCePostSaleDialog } from '@/components/pdv-v2/PDVV2NFCePostSaleDialog';
import type { ExtraItem } from '@/components/pdv-v2/PDVV2AddItemSearch';
import { runTefPayment, type TefOptions } from '@/utils/pdvV2Tef';
import { TEF_PRINT_PROMPT_CLOSED_EVENT } from '@/components/TefPrintPromptDialog';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { buildNfceFiscalFields } from '@/utils/nfceItemFiscal';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { emitirNFCe, type NFCeItem, type NFCeRecord, type NFCeTefData } from '@/services/nfceService';
import { PDVV2SequentialPaymentDialog } from '@/components/pdv-v2/PDVV2SequentialPaymentDialog';
import { runMultiPayment, buildPagamentosSplit, type MultiPaymentInputLine } from '@/utils/pdvV2MultiPayment';
import { recordSalePayments } from '@/utils/recordSalePayments';
interface OrderCardChargeDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após cobrança concluída com sucesso (para refresh externo, se necessário). */
  onCharged?: () => void;
}

/**
 * Diálogo de cobrança para pedidos do cardápio (Lancheria I9).
 *
 * Abre o PDVV2PaymentDialog (mesma UX do Pedido Express) permitindo:
 * - Escolher forma de pagamento do zero
 * - Selecionar Somente Venda ou Venda + NFC-e
 * - Disparar TEF quando aplicável
 * - Imprimir DANFE/recibo opcionalmente
 *
 * Importante:
 * - NÃO altera o status do pedido (`ready` permanece `ready`).
 * - Cria um `pdv_sale` vinculado ao pedido para entrar no fechamento de caixa
 *   e habilitar a "Reimprimir DANFE NFC-e" no card.
 * - O notes do pedido recebe um sufixo "[COBRADO] Pagamento: <forma>" para
 *   o operador identificar visualmente que a cobrança foi realizada.
 */
export function OrderCardChargeDialog({ order, open, onOpenChange, onCharged }: OrderCardChargeDialogProps) {
  const { company } = useAuthContext();
  const { currentRegister, addSale } = useCashRegister({ companyId: company?.id });
  const { products } = useProducts({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const { enabled: mercadoEnabled } = useMercadoEnabled(company?.id);
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const fiscalEnabled = isModuleEnabled('fiscal');

  const [nfceRecord, setNfceRecord] = useState<NFCeRecord | null>(null);
  const [nfceDialogOpen, setNfceDialogOpen] = useState(false);
  const [nfceAutoPrint, setNfceAutoPrint] = useState(false);
  const [tefStatus, setTefStatus] = useState('');
  const [isEmittingNfce, setIsEmittingNfce] = useState(false);
  // Multi-payment (v1.6 beta) — fluxo isolado. NÃO altera handleConfirm.
  const [multiPayOpen, setMultiPayOpen] = useState(false);
  const [multiPayProcessing, setMultiPayProcessing] = useState(false);
  const [multiPayStatus, setMultiPayStatus] = useState('');
  const I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
  const isI9Company = company?.id === I9_COMPANY_ID;
  const [tefPromptOpen, setTefPromptOpen] = useState(false);
  const tefPromptOpenRef = useRef(false);
  const [pendingNfceOpen, setPendingNfceOpen] = useState(false);
  // Trava anti-duplo-clique para qualquer fluxo de cobrança neste diálogo.
  // Cliques quase simultâneos (< 50ms) chegavam a inserir 2-3 vendas em
  // pdv_sales. useRef garante sincronia entre handlers — setState não
  // atualiza a tempo entre dois cliques no mesmo tick do React.
  const chargingRef = useRef(false);
  const paidQtyByIndex = useMemo(() => {
    const raw = (order.paidItems as any)?.paid_qtys;
    const map = new Map<string, number>();
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([key, value]) => {
        const qty = Number(value);
        if (Number.isFinite(qty) && qty > 0) map.set(key, qty);
      });
    }
    return map;
  }, [order.paidItems]);
  const hasPartialItemPayments = paidQtyByIndex.size > 0;

  const checkoutItems = useMemo(
    () =>
      order.items.map((i, idx) => {
        const paidQty = Math.min(i.quantity, paidQtyByIndex.get(String(idx)) || 0);
        return {
          id: String(idx),
          name: i.name,
          quantity: i.quantity,
          unit_price: i.price,
          paidQty,
          paid: paidQty >= i.quantity,
        };
      }),
    [order.items, paidQtyByIndex],
  );
  const pendingExistingTotal = useMemo(
    () => checkoutItems.reduce((sum, item) => {
      const pendingQty = Math.max(0, item.quantity - (item.paidQty || 0));
      return sum + pendingQty * item.unit_price;
    }, 0),
    [checkoutItems],
  );
  const chargeBaseTotal = hasPartialItemPayments
    ? pendingExistingTotal
    : Math.max(0, order.total - Number(order.paidAmount || 0));

  // Estado de "split por pessoas em andamento" — persistido em paid_items.split_state.
  // Quando presente e ainda não quitado, o PDVV2PaymentDialog mostra o painel
  // read-only "Pessoa X/N — quantas partes cobrar agora?" em vez de pedir
  // novamente o nº de pessoas / valor por pessoa.
  const splitState = useMemo(() => {
    const raw = (order.paidItems as any)?.split_state;
    if (!raw || typeof raw !== 'object') return null;
    const totalPeople = Number(raw.totalPeople);
    const perPerson = Number(raw.perPerson);
    const paidPeople = Number(raw.paidPeople);
    if (!Number.isFinite(totalPeople) || totalPeople < 1) return null;
    if (!Number.isFinite(perPerson) || perPerson <= 0) return null;
    if (!Number.isFinite(paidPeople) || paidPeople < 0) return null;
    if (paidPeople >= totalPeople) return null;
    return { totalPeople, perPerson, paidPeople };
  }, [order.paidItems]);
  const activeSplit = splitState
    ? {
        perPerson: splitState.perPerson,
        totalPeople: splitState.totalPeople,
        currentPerson: splitState.paidPeople + 1,
      }
    : undefined;

  const cleanItemName = (name: string) =>
    name.includes('(') ? name.substring(0, name.indexOf('(')).trim() : name;

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

  useEffect(() => {
    if (!tefPromptOpen && pendingNfceOpen && nfceRecord) {
      setNfceDialogOpen(true);
      setPendingNfceOpen(false);
    }
  }, [tefPromptOpen, pendingNfceOpen, nfceRecord]);

  async function handleConfirm(params: {
    paymentMethodId: string;
    paymentName: string;
    discount: number;
    finalTotal: number;
    documentMode: DocumentMode;
    extraItems: ExtraItem[];
    printDocument?: boolean;
    tefOptions?: TefOptions;
    tefIntegration?: 'tef_pinpad' | 'tef_smartpos';
    customerDocument?: string;
    prechargedTef?: { tefData?: NFCeTefData; notesFragment?: string };
    itemsInfo?: Array<{ id: string; paidQty: number }>;
    splitInfo?: { perPerson: number; totalPeople: number; partsToCharge?: number };
  }) {
    if (!company?.id) return;
    if (!currentRegister) {
      toast.error('Caixa precisa estar aberto para cobrar pedidos.');
      return;
    }

    // Guard anti-duplo-clique (síncrono). Bloqueia chamadas reentrantes
    // antes de qualquer await — evita 2-3 vendas duplicadas em pdv_sales.
    if (chargingRef.current) return;
    chargingRef.current = true;

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        toast.error('Usuário não autenticado.');
        return;
      }

      // ===== Itens extras adicionados na cobrança =====
      // Persistidos em order_items (added_after=true), incluídos na venda do caixa
      // e na NFC-e. Total do pedido é atualizado abaixo.
      const selectedQtyByIndex = new Map<number, number>();
      (params.itemsInfo || []).forEach((item) => {
        const idx = parseInt(item.id, 10);
        if (!Number.isNaN(idx) && item.paidQty > 0) {
          selectedQtyByIndex.set(idx, item.paidQty);
        }
      });
      const isSplitByPeople = !!params.splitInfo && (params.itemsInfo || []).length === 0;
      const selectedExistingItems = isSplitByPeople ? [] : order.items.flatMap((it, idx) => {
        const alreadyPaid = Math.min(it.quantity, paidQtyByIndex.get(String(idx)) || 0);
        const pendingQty = Math.max(0, it.quantity - alreadyPaid);
        const explicitItemSelection = (params.itemsInfo || []).length > 0;
        const qtyToCharge = explicitItemSelection
          ? Math.min(pendingQty, selectedQtyByIndex.get(idx) ?? 0)
          : (hasPartialItemPayments ? pendingQty : it.quantity);
        if (qtyToCharge <= 0) return [];
        return [{
          source_index: idx,
          product_id: it.productId || null,
          product_name: cleanItemName(it.name),
          quantity: qtyToCharge,
          unit_price: it.price,
        }];
      });
      const extras = params.extraItems || [];
      const extrasTotal = extras.reduce((s, ex) => s + ex.unit_price * ex.quantity, 0);
      const extrasAsSaleItems = extras.map((ex) => ({
        product_id: ex.product_id,
        product_name: ex.product_name.includes('(')
          ? ex.product_name.substring(0, ex.product_name.indexOf('(')).trim()
          : ex.product_name,
        quantity: ex.quantity,
        unit_price: ex.unit_price,
      }));
      // Quando é divisão por pessoas (sem fração de item explícita), lançamos
      // a parcela como itens RATEADOS proporcionalmente (mesmo array para caixa
      // e NFC-e). A quantidade é fracionada (ex.: 1× X-Burger / 5 pessoas →
      // 0,200) mantendo o preço unitário original — assim o estoque baixa
      // corretamente ao final das N parcelas. Os itens não são marcados em
      // paid_qtys (source_index = -1) — o controle de saldo continua via
      // paid_amount / split_state.
      let splitProratedItems: typeof selectedExistingItems = [];
      if (isSplitByPeople && params.splitInfo && params.finalTotal > 0) {
        const totalPeople = params.splitInfo.totalPeople;
        const prevSplit = (order.paidItems as any)?.split_state;
        const prevPaidPeople = Number(prevSplit?.paidPeople || 0);
        const remainingBefore = Math.max(1, totalPeople - prevPaidPeople);
        const requested = Math.max(
          1,
          params.splitInfo.partsToCharge ||
            Math.round(params.finalTotal / Math.max(0.01, params.splitInfo.perPerson)),
        );
        const partsNow = Math.min(requested, remainingBefore);
        const isLastBatch = partsNow >= remainingBefore;
        const ratio = isLastBatch ? remainingBefore / totalPeople : partsNow / totalPeople;
        const base = order.items
          .filter((it) => it.quantity > 0 && it.price > 0)
          .map((it, idx) => ({
            source_index: -1,
            product_id: it.productId || null,
            product_name: cleanItemName(it.name),
            quantity: Number((it.quantity * ratio).toFixed(3)),
            unit_price: it.price,
            _origIdx: idx,
          }));
        // Ajusta centavos do último item para o somatório bater com finalTotal
        if (base.length > 0) {
          const sumNow = Number(
            base.reduce((s, it) => s + it.quantity * it.unit_price, 0).toFixed(2),
          );
          const diff = Number((params.finalTotal - sumNow).toFixed(2));
          if (Math.abs(diff) >= 0.01) {
            const last = base[base.length - 1];
            if (last.quantity > 0) {
              last.unit_price = Number(
                (last.unit_price + diff / last.quantity).toFixed(2),
              );
            }
          }
        }
        splitProratedItems = base.map(({ _origIdx, ...rest }) => rest);
      }
      const effectiveSaleItems = [
        ...selectedExistingItems,
        ...extrasAsSaleItems,
        ...splitProratedItems,
      ];
      if (effectiveSaleItems.length === 0) {
        toast.info('Não há itens pendentes para cobrar neste pedido.');
        return;
      }

      if (extras.length > 0 && company?.id) {
        const insertPayload = extras.map((ex) => ({
          order_id: order.id,
          company_id: company.id,
          product_id: ex.product_id,
          name: ex.product_name,
          quantity: ex.quantity,
          price: ex.unit_price,
          notes: ex.notes || null,
          added_after: true,
        }));
        const { error: insertErr } = await supabase
          .from('order_items')
          .insert(insertPayload as any);
        if (insertErr) {
          console.error('[OrderCardCharge] erro ao inserir extras:', insertErr);
          toast.error('Erro ao adicionar itens extras ao pedido.');
          return;
        }
      }

      // ===== TEF: executa ANTES de criar a venda (mesmo fluxo de Mesa) =====
      let tefData: NFCeTefData | undefined;
      let tefNote = '';
      if (params.tefIntegration && params.tefOptions) {
        const result = await runTefPayment({
          companyId: company.id,
          integration: params.tefIntegration,
          amount: params.finalTotal,
          options: params.tefOptions,
          description: order.customerName ? `Cardápio - ${order.customerName}` : 'Pedido Cardápio',
          onStatus: setTefStatus,
        });
        setTefStatus('');
        if (!result.success) {
          return;
        }
        tefData = result.tefData;
        tefNote = result.notesFragment ? ` | ${result.notesFragment}` : '';
      }

      const saleNotes = `[CARDAPIO #${order.orderCode || order.dailyNumber}] Pagamento: ${params.paymentName}${tefNote}`;

      // 1) Registra a venda no caixa, vinculada ao pedido
      const saleId = await addSale(
        effectiveSaleItems,
        params.paymentMethodId,
        authUser.id,
        params.discount || 0,
        order.customerName,
        saleNotes,
        order.id,
      );

      if (!saleId) {
        // addSale já exibe toast em caso de erro
        return;
      }

      // 2) Atualiza o progresso da cobrança. Só marca [COBRADO] quando não
      //    resta saldo de itens, preservando o botão Cobrar para frações pendentes.
      const currentPaidAmount = Number(order.paidAmount || 0);
      const chargedAmount = effectiveSaleItems.reduce(
        (sum, it) => sum + it.quantity * it.unit_price,
        0,
      );
      const nextPaidQtyByIndex = new Map<string, number>(paidQtyByIndex);
      selectedExistingItems.forEach((it) => {
        if (it.source_index >= 0) {
          const key = String(it.source_index);
          nextPaidQtyByIndex.set(key, Math.min(
            order.items[it.source_index].quantity,
            (nextPaidQtyByIndex.get(key) || 0) + it.quantity,
          ));
        }
      });
      const nextPaidItems: Record<string, number> = {};
      nextPaidQtyByIndex.forEach((qty, key) => {
        if (qty > 0) nextPaidItems[key] = qty;
      });
      const baseTotalAfterExtras = Number((order.total + extrasTotal).toFixed(2));
      const nextPaidAmount = Number((currentPaidAmount + chargedAmount).toFixed(2));
      const isFullyPaid = nextPaidAmount >= baseTotalAfterExtras - 0.009;
      const nextPaymentNote = `${isFullyPaid ? '[COBRADO]' : '[PARCIAL]'} Pagamento: ${params.paymentName}${tefNote}`;
      const newNotes = order.notes
        ? `${order.notes} | ${nextPaymentNote}`
        : nextPaymentNote;
      const orderUpdate: any = {
        notes: newNotes,
        payment_status: isFullyPaid ? 'paid' : 'partial',
        paid_amount: isFullyPaid ? baseTotalAfterExtras : nextPaidAmount,
        paid_items: { ...((order.paidItems as any) || {}), paid_qtys: nextPaidItems },
      };
      // Atualiza/cria/limpa o split_state quando esta cobrança é por divisão
      // de pessoas. Mantém continuidade entre reaberturas do "Cobrar".
      if (isSplitByPeople && params.splitInfo) {
        const incomingPerPerson = params.splitInfo.perPerson;
        const incomingTotalPeople = params.splitInfo.totalPeople;
        const parts = Math.max(
          1,
          params.splitInfo.partsToCharge ||
            Math.round(params.finalTotal / Math.max(0.01, incomingPerPerson)),
        );
        const prevSplit = (order.paidItems as any)?.split_state;
        const prevPaid = Number(prevSplit?.paidPeople || 0);
        const nextPaidPeople = prevPaid + parts;
        const baseSplit = (order.paidItems as any) || {};
        if (isFullyPaid || nextPaidPeople >= incomingTotalPeople) {
          // Quitado — remove split_state para não vazar entre cobranças futuras.
          const { split_state: _drop, ...rest } = baseSplit;
          orderUpdate.paid_items = { ...rest, paid_qtys: nextPaidItems };
        } else {
          orderUpdate.paid_items = {
            ...baseSplit,
            paid_qtys: nextPaidItems,
            split_state: {
              totalPeople: incomingTotalPeople,
              perPerson: incomingPerPerson,
              paidPeople: nextPaidPeople,
            },
          };
        }
      } else if (isFullyPaid) {
        // Pedido quitado por outro caminho — limpa split_state se existir.
        const base = (order.paidItems as any) || {};
        if (base.split_state) {
          const { split_state: _drop, ...rest } = base;
          orderUpdate.paid_items = { ...rest, paid_qtys: nextPaidItems };
        }
      }
      if (extrasTotal > 0) {
        orderUpdate.total = baseTotalAfterExtras;
      }
      await supabase.from('orders').update(orderUpdate).eq('id', order.id);

      // 3) Emite NFC-e quando solicitado
      if (params.documentMode === 'sale_with_nfce' && fiscalEnabled) {
        try {
          setIsEmittingNfce(true);
          const nfceItems: NFCeItem[] = effectiveSaleItems.map((it) => {
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

          const externalId = `CARD-${currentRegister.id.substring(0, 8)}-${Date.now()}`;
          const cleanDoc = (params.customerDocument || '').replace(/\D/g, '');
          const destinatario =
            cleanDoc.length === 11
              ? { cpf: cleanDoc, nome: order.customerName || undefined }
              : cleanDoc.length === 14
              ? { cnpj: cleanDoc, nome: order.customerName || undefined }
              : undefined;

          await emitirNFCe(company.id, saleId, {
            external_id: externalId,
            itens: nfceItems,
            valor_desconto: params.discount || 0,
            valor_frete: 0,
            observacoes: order.customerName ? `Cliente: ${order.customerName}` : undefined,
            destinatario,
            tef: tefData,
          } as any);

          toast.success('NFC-e enviada para processamento!');

          const { data: rec } = await supabase
            .from('nfce_records')
            .select('*')
            .eq('sale_id', saleId)
            .maybeSingle();

          if (rec) {
            setNfceRecord(rec as unknown as NFCeRecord);
            setNfceAutoPrint(!!params.printDocument);
            if (isI9Company && tefPromptOpenRef.current) {
              setPendingNfceOpen(true);
            } else {
              setNfceDialogOpen(true);
            }
          }
        } catch (err: any) {
          console.error('[OrderCardCharge] NFC-e emission error:', err);
          toast.error(
            `Cobrança registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`,
          );
        } finally {
          setIsEmittingNfce(false);
        }
      } else {
        toast.success(`Pedido #${order.orderCode || order.dailyNumber} cobrado!`);
      }

      onCharged?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[OrderCardCharge] error:', err);
      toast.error(err?.message || 'Erro ao cobrar pedido.');
    } finally {
      chargingRef.current = false;
    }
  }

  /**
   * ===== Multi-payment (v1.6 beta) — fluxo isolado =====
   * NÃO altera handleConfirm, runTefPayment, pinpadService nem TEF v1.1.
   * Espelha PedidoExpress.handleMultiPaymentSubmit:
   *  1) runMultiPayment (tudo-ou-nada, rollback automático em recusa)
   *  2) addSale UMA vez (forma = primary)
   *  3) UPDATE orders → payment_status='paid' + notes '[COBRADO][MULTI]'
   *  4) NFC-e com pagamentos_split (vários detPag)
   */
  async function handleMultiPaymentSubmit(
    lines: MultiPaymentInputLine[],
    opts: { wantsNfce: boolean },
  ) {
    if (!company?.id) return;
    if (!currentRegister) {
      toast.error('Caixa precisa estar aberto para cobrar pedidos.');
      return;
    }
    // Guard anti-duplo-clique (síncrono).
    if (chargingRef.current) return;
    chargingRef.current = true;
    setMultiPayProcessing(true);
    setMultiPayStatus('Iniciando cobranças…');
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        toast.error('Usuário não autenticado.');
        return;
      }

      const mp = await runMultiPayment({
        companyId: company.id,
        lines,
        description: order.customerName ? `Cardápio - ${order.customerName}` : 'Pedido Cardápio',
        onStatus: setMultiPayStatus,
      });
      if (!mp.ok || !mp.primary || !mp.lines) {
        const extra = mp.rolledBackCount ? ` (${mp.rolledBackCount} cobrança(s) estornada(s))` : '';
        toast.error((mp.errorMessage || 'Cobrança recusada') + extra);
        return;
      }

      // Itens da venda: o que ainda está pendente do pedido.
      const saleItems = order.items
        .map((it, idx) => {
          const paidQty = paidQtyByIndex.get(String(idx)) || 0;
          const pendingQty = Math.max(0, it.quantity - paidQty);
          if (pendingQty <= 0) return null;
          return {
            product_id: it.productId || null,
            product_name: cleanItemName(it.name),
            quantity: pendingQty,
            unit_price: it.price,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (saleItems.length === 0) {
        toast.error('Não há itens pendentes para cobrar.');
        return;
      }

      const saleNotes = `[CARDAPIO #${order.orderCode || order.dailyNumber}][MULTI] Pagamento: ${mp.primary.payment_name}${mp.combinedNotesFragment ? ` | ${mp.combinedNotesFragment}` : ''}`;

      const saleId = await addSale(
        saleItems,
        mp.primary.payment_method_id,
        authUser.id,
        0,
        order.customerName,
        saleNotes,
        order.id,
      );
      if (!saleId) return;
      // Registra o split de formas para o relatório de fechamento.
      if (company?.id) {
        await recordSalePayments(saleId, company.id, mp.lines);
      }

      // Marca pedido como pago.
      const chargedAmount = saleItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
      const currentPaidAmount = Number(order.paidAmount || 0);
      const nextPaidAmount = Number((currentPaidAmount + chargedAmount).toFixed(2));
      const baseTotal = Number(order.total.toFixed(2));
      const isFullyPaid = nextPaidAmount >= baseTotal - 0.009;
      const nextPaymentNote = `${isFullyPaid ? '[COBRADO]' : '[PARCIAL]'}[MULTI] Pagamento: ${mp.primary.payment_name}`;
      const newNotes = order.notes ? `${order.notes} | ${nextPaymentNote}` : nextPaymentNote;
      await supabase.from('orders').update({
        notes: newNotes,
        payment_status: isFullyPaid ? 'paid' : 'partial',
        paid_amount: isFullyPaid ? baseTotal : nextPaidAmount,
      }).eq('id', order.id);

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
          const externalId = `CARD-MULTI-${currentRegister.id.substring(0, 8)}-${Date.now()}`;
          await emitirNFCe(company.id, saleId, {
            external_id: externalId,
            itens: nfceItems,
            valor_desconto: 0,
            valor_frete: 0,
            observacoes: order.customerName ? `Cliente: ${order.customerName}` : undefined,
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
          console.error('[OrderCardCharge][MULTI] NFC-e error:', err);
          toast.error(`Cobrança registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`);
        } finally {
          setIsEmittingNfce(false);
        }
      } else {
        toast.success(`Pedido #${order.orderCode || order.dailyNumber} cobrado!`);
      }

      onCharged?.();
      setMultiPayOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      console.error('[OrderCardCharge][MULTI] error:', err);
      toast.error(err?.message || 'Erro ao cobrar pedido.');
    } finally {
      setMultiPayProcessing(false);
      setMultiPayStatus('');
      chargingRef.current = false;
    }
  }

  return (
    <>
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
      <PDVV2PaymentDialog
        open={open}
        onOpenChange={onOpenChange}
        companyId={company?.id}
        total={chargeBaseTotal}
        title={`Cobrar pedido #${order.orderCode || order.dailyNumber}`}
        showDocumentMode
        showAddItem
        tefStatus={tefStatus}
        deliveryFilter={order.deliveryAddress && order.deliveryAddress.trim().length > 0 ? 'delivery' : 'pickup'}
        checkoutItems={checkoutItems}
        activeSplit={activeSplit}
        onConfirm={handleConfirm}
        onSplitPayments={() => {
          onOpenChange(false);
          setMultiPayOpen(true);
        }}
      />
      <PDVV2SequentialPaymentDialog
        open={multiPayOpen}
        onOpenChange={setMultiPayOpen}
        companyId={company?.id}
        total={chargeBaseTotal}
        fiscalEnabled={fiscalEnabled}
        contextKey={`order:${order.id}`}
        contextLabel={`Pedido #${order.orderCode || order.dailyNumber}`}
        title={`Dividir formas — Pedido #${order.orderCode || order.dailyNumber}`}
        processingStatus={multiPayStatus}
        processing={multiPayProcessing}
        onConfirm={handleMultiPaymentSubmit}
      />
      {nfceRecord && (
        <PDVV2NFCePostSaleDialog
          open={nfceDialogOpen}
          onOpenChange={(o) => {
            setNfceDialogOpen(o);
            if (!o) setNfceRecord(null);
          }}
          companyId={company?.id}
          initialRecord={nfceRecord}
          autoPrint={nfceAutoPrint}
        />
      )}
    </>
  );
}