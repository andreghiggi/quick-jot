import { useState, useMemo } from 'react';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import type { DocumentMode } from '@/components/pdv-v2/PDVV2DocumentModeSelector';
import { PDVV2NFCePostSaleDialog } from '@/components/pdv-v2/PDVV2NFCePostSaleDialog';
import type { ExtraItem } from '@/components/pdv-v2/PDVV2AddItemSearch';
import type { TefOptions } from '@/utils/pdvV2Tef';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { emitirNFCe, type NFCeItem, type NFCeRecord, type NFCeTefData } from '@/services/nfceService';

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
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const fiscalEnabled = isModuleEnabled('fiscal');

  const [nfceRecord, setNfceRecord] = useState<NFCeRecord | null>(null);
  const [nfceDialogOpen, setNfceDialogOpen] = useState(false);
  const [nfceAutoPrint, setNfceAutoPrint] = useState(false);

  // Itens do pedido convertidos para o formato esperado pela venda/NFC-e.
  const saleItems = useMemo(
    () =>
      order.items.map((it) => ({
        // Remove sufixo "(Adicionais: ...)" do nome para a venda/NFC-e
        product_id: it.productId || null,
        product_name: it.name.includes('(') ? it.name.substring(0, it.name.indexOf('(')).trim() : it.name,
        quantity: it.quantity,
        unit_price: it.price,
      })),
    [order.items],
  );

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
  }) {
    if (!company?.id) return;
    if (!currentRegister) {
      toast.error('Caixa precisa estar aberto para cobrar pedidos.');
      return;
    }

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        toast.error('Usuário não autenticado.');
        return;
      }

      const tefNote = params.prechargedTef?.notesFragment
        ? ` | ${params.prechargedTef.notesFragment}`
        : '';
      const saleNotes = `[CARDAPIO #${order.orderCode || order.dailyNumber}] Pagamento: ${params.paymentName}${tefNote}`;

      // 1) Registra a venda no caixa, vinculada ao pedido
      const saleId = await addSale(
        saleItems,
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

      // 2) Marca o pedido como cobrado (sufixo no notes para identificação visual)
      const newNotes = order.notes
        ? `${order.notes} | [COBRADO] Pagamento: ${params.paymentName}`
        : `[COBRADO] Pagamento: ${params.paymentName}`;
      await supabase.from('orders').update({ notes: newNotes }).eq('id', order.id);

      // 3) Emite NFC-e quando solicitado
      if (params.documentMode === 'sale_with_nfce' && fiscalEnabled) {
        try {
          const nfceItems: NFCeItem[] = saleItems.map((it) => {
            const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
            const taxRule = product?.taxRuleId
              ? taxRules.find((tr) => tr.id === product.taxRuleId)
              : null;
            return {
              codigo: it.product_id || 'AVULSO',
              descricao: it.product_name,
              ncm: taxRule?.ncm || '00000000',
              cfop: taxRule?.cfop || '5102',
              unidade: 'UN',
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
            tef: params.prechargedTef?.tefData,
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
            setNfceDialogOpen(true);
          }
        } catch (err: any) {
          console.error('[OrderCardCharge] NFC-e emission error:', err);
          toast.error(
            `Cobrança registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`,
          );
        }
      } else {
        toast.success(`Pedido #${order.orderCode || order.dailyNumber} cobrado!`);
      }

      onCharged?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[OrderCardCharge] error:', err);
      toast.error(err?.message || 'Erro ao cobrar pedido.');
    }
  }

  return (
    <>
      <PDVV2PaymentDialog
        open={open}
        onOpenChange={onOpenChange}
        companyId={company?.id}
        total={order.total}
        title={`Cobrar pedido #${order.orderCode || order.dailyNumber}`}
        showDocumentMode
        chargeTefBeforePopups
        channel="pdv"
        checkoutItems={order?.items?.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.price }))}
        onConfirm={handleConfirm}
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