import { useState, useMemo, useEffect } from 'react';
import { ShoppingCart, Search, Minus, Plus, CreditCard, Banknote, QrCode, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useProducts } from '@/hooks/useProducts';
import { useScale } from '@/hooks/useScale';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { brl as formatPrice } from '@/components/pdv-v2/_format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useOrders } from '@/hooks/useOrders';
import { useCashRegister } from '@/hooks/useCashRegister';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useFiscalEnabled } from '@/hooks/useFiscalEnabled';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { openCashDrawer } from '@/utils/cashDrawer';
import { enqueueProductionByStation } from '@/utils/printRouting';
import { printOnlyReceipt } from '@/utils/pdvV2Print';
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { computeReadyOffsetMinutes } from '@/utils/estimatedReadyOffset';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { PDVV2NFCePostSaleDialog } from '@/components/pdv-v2/PDVV2NFCePostSaleDialog';
import { runTefPayment, type TefOptions } from '@/utils/pdvV2Tef';
import { emitirNFCe, type NFCeRecord, type NFCeItem, type NFCeTefData } from '@/services/nfceService';
import { buildNfceFiscalFields } from '@/utils/nfceItemFiscal';



interface Props {
  companyId: string;
}

/** Amore Mio — fluxo de finalização padrão do PDV na Venda Rápida (isolado por loja). */
const AMORE_MIO_ID = 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8';

export function PDVV2FastCheckout({ companyId }: Props) {
  const { products, loading: productsLoading } = useProducts({ companyId });
  const { settings: storeSettings } = useStoreSettings({ companyId });
  const { getWeight, reading: readingScale } = useScale();
  const { currentRegister, addSale } = useCashRegister({ companyId });
  const { addOrder } = useOrders({ companyId });
  const { user } = useAuthContext();
  const { activePaymentMethods: pdvPaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });
  const { taxRules } = useTaxRules({ companyId });
  const { enabled: fiscalEnabled } = useFiscalEnabled(companyId);
  const { enabled: mercadoEnabled } = useMercadoEnabled(companyId);

  const isAmoreMio = companyId === AMORE_MIO_ID;

  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Amore Mio: fluxo padrão de cobrança
  const [payOpen, setPayOpen] = useState(false);
  const [tefStatus, setTefStatus] = useState('');
  const [nfceRecord, setNfceRecord] = useState<NFCeRecord | null>(null);
  const [nfceDialogOpen, setNfceDialogOpen] = useState(false);
  const [nfceAutoPrint, setNfceAutoPrint] = useState(true);

  // Amore Mio: produto sem preço cadastrado
  const [pendingPriceProduct, setPendingPriceProduct] = useState<any | null>(null);
  const [priceInput, setPriceInput] = useState('');

  const activeProducts = useMemo(
    () => products.filter((p) => p.active && p.pdvItem !== false),
    [products]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return activeProducts
      .filter((p) => 
        p.name.toLowerCase().includes(q) || 
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.scaleBarcode && p.scaleBarcode.toLowerCase() === q)
      )
      .slice(0, 10);
  }, [activeProducts, query]);

  // Efeito para adicionar produto automaticamente se houver match exato no código de balança
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    const exactMatch = activeProducts.find(p => 
      p.scaleBarcode && p.scaleBarcode.toLowerCase() === q
    );

    if (exactMatch) {
      handleAddProduct(exactMatch);
    }
  }, [query, activeProducts]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0), [cart]);

  async function handleAddProduct(p: any, priceOverride?: number) {
    // Amore Mio: produto cadastrado sem preço → pedir valor antes de adicionar
    const basePrice = priceOverride ?? p.price;
    if (isAmoreMio && priceOverride == null && (!p.price || Number(p.price) <= 0)) {
      setPendingPriceProduct(p);
      setPriceInput('');
      setQuery('');
      return;
    }

    let weight: number | null = null;
    const isScaleItem = p.unit?.toLowerCase() === 'kg' || p.sellByWeight;

    if (isScaleItem && storeSettings.scaleEnabled) {
      weight = await getWeight();
      if (weight === null || weight <= 0) {
        toast.error('Não foi possível ler o peso da balança');
        return;
      }
    }

    const quantity = weight ?? 1;
    const newItem = {
      id: crypto.randomUUID(),
      product_id: p.id,
      product_name: p.name + (weight ? ` [PESO: ${weight.toFixed(3)}kg]` : ''),
      quantity,
      unit_price: basePrice,
    };

    setCart(prev => [...prev, newItem]);
    setQuery('');
    toast.success(`${p.name} adicionado`);
  }

  function confirmManualPrice() {
    const parsed = parseFloat(priceInput.replace(',', '.'));
    if (!parsed || parsed <= 0) {
      toast.error('Informe um preço válido');
      return;
    }
    const p = pendingPriceProduct;
    setPendingPriceProduct(null);
    setPriceInput('');
    if (p) handleAddProduct(p, parsed);
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
    ).filter(item => item.quantity > 0));
  }

  /** Emite a NFC-e da venda rápida e abre o diálogo de acompanhamento (padrão PDV V2). */
  async function emitNfceForSale(args: {
    saleId: string;
    items: { product_id: string | null; product_name: string; quantity: number; unit_price: number }[];
    discount: number;
    shouldPrint: boolean;
    tefData?: NFCeTefData;
    customerDocument?: string;
  }): Promise<void> {
    const { saleId, items, discount, shouldPrint, tefData, customerDocument } = args;
    try {
      const nfceItems: NFCeItem[] = items.map((it) => {
        const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
        const taxRule = product?.taxRuleId ? taxRules.find((tr) => tr.id === product.taxRuleId) : null;
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

      const cleanDoc = (customerDocument || '').replace(/\D/g, '');
      const destinatario = cleanDoc.length === 11
        ? { cpf: cleanDoc }
        : cleanDoc.length === 14
          ? { cnpj: cleanDoc }
          : undefined;

      await emitirNFCe(companyId, saleId, {
        external_id: `FAST-${saleId.substring(0, 8)}-${Date.now()}`,
        itens: nfceItems,
        valor_desconto: discount || 0,
        valor_frete: 0,
        destinatario,
        tef: tefData,
      } as any);

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
      toast.success('NFC-e enviada para processamento!');
    } catch (err: any) {
      console.error('[FastCheckout] NFC-e error:', err);
      toast.error(`Venda registrada, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`);
    }
  }

  async function finishSale(opts: {
    methodId: string;
    methodName: string;
    discount?: number;
    finalTotal?: number;
    documentMode?: 'sale_only' | 'sale_with_nfce';
    printDocument?: boolean;
    tefOptions?: TefOptions;
    tefIntegration?: 'tef_pinpad' | 'tef_smartpos';
    customerDocument?: string;
  }) {
    if (cart.length === 0) return;
    if (!currentRegister) {
      toast.error('Abra o caixa antes de vender');
      return;
    }
    if (!user) return;

    const discount = opts.discount || 0;
    const finalTotal = opts.finalTotal ?? subtotal;

    setIsSubmitting(true);
    try {
      // 1. TEF (quando a forma de pagamento for integração maquininha) — aborta se falhar
      let tefData: NFCeTefData | undefined;
      let tefNotesFragment = '';
      if (opts.tefIntegration && opts.tefOptions) {
        const result = await runTefPayment({
          companyId,
          integration: opts.tefIntegration,
          amount: finalTotal,
          options: opts.tefOptions,
          description: 'Venda Rápida',
          onStatus: setTefStatus,
        });
        setTefStatus('');
        if (!result.success) return;
        tefData = result.tefData;
        tefNotesFragment = result.notesFragment ? ` | ${result.notesFragment}` : '';
      }

      // 2. Registrar a venda no caixa (pdv_sales)
      const saleData = {
        company_id: companyId,
        cash_register_id: currentRegister.id,
        payment_method_id: opts.methodId,
        total: subtotal,
        discount,
        final_total: finalTotal,
        notes: `[VENDA RÁPIDA]${tefNotesFragment}`,
        created_by: user.id,
      };

      const { data: sale, error: saleError } = await supabase
        .from('pdv_sales')
        .insert(saleData as any)
        .select()
        .single();

      if (saleError) throw saleError;

      // 3. Registrar itens da venda
      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('pdv_sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      // 4. Criar o pedido (opcional, mas bom para histórico unificado)
      const created = await addOrder({
        customerName: 'Cliente Balcão',
        total: finalTotal,
        status: 'delivered',
        origin: 'balcao',
        items: cart.map(it => ({
          id: crypto.randomUUID(),
          productId: it.product_id,
          name: it.product_name,
          quantity: it.quantity,
          price: it.unit_price,
        })),
        notes: `[EXPRESS] [COBRADO] [VENDA RÁPIDA] Pagamento: ${opts.methodName}${tefNotesFragment}`,
      });

      const shouldPrint = opts.printDocument !== false;
      const wantsNfce = (opts.tefIntegration ? true : opts.documentMode === 'sale_with_nfce')
        && fiscalEnabled;

      if (created) {
        // Impressão automática (mesmo padrão do Pedido Express)
        try {
          const createdShortCode = created.shortCode;
          const createdOrderCode = created.orderCode || 'EXPRESS';
          const createdDailyNumber = created.dailyNumber ?? 0;
          const paperSize = storeSettings.printerPaperSize || '80mm';

          // 1. Recibo de Venda
          if (shouldPrint && !wantsNfce) {
            const printItems = cart.map((item) => ({
              name: item.product_name,
              quantity: item.quantity,
              price: item.unit_price,
            }));

            await printOnlyReceipt({
              companyId,
              orderCode: createdOrderCode,
              dailyNumber: createdDailyNumber,
              shortCode: createdShortCode,
              customerName: 'Cliente Balcão',
              items: printItems,
              total: finalTotal,
              notes: `Pagamento: ${opts.methodName}${discount > 0 ? ` | Desconto: R$ ${discount.toFixed(2)}` : ''} | [VENDA RÁPIDA]`,
              paperSize,
              printLayout: storeSettings.printLayout,
            });
          }

          // 2. Comanda de Produção (Cozinha)
          if (storeSettings.autoPrintProductionTicket) {
            const productionItems = cart.map((item) => ({
              id: item.product_id,
              product_id: item.product_id,
              name: item.product_name,
              product_name: item.product_name,
              quantity: item.quantity,
              category: item.category,
              category_name: item.category,
            }));

            await enqueueProductionByStation(
              companyId,
              createdOrderCode,
              productionItems,
              createdShortCode || createdDailyNumber.toString(),
              'Cliente Balcão',
              'balcao'
            );
          }
        } catch (printErr) {
          console.error('[FastCheckout] Erro ao enfileirar impressão:', printErr);
        }
      }

      // 5. NFC-e (fluxo padrão do PDV)
      if (wantsNfce) {
        await emitNfceForSale({
          saleId: sale.id,
          items: cart.map((it) => ({
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
          })),
          discount,
          shouldPrint,
          tefData,
          customerDocument: opts.customerDocument,
        });
      }

      setCart([]);
      setPayOpen(false);

      // Acionar gaveta de caixa se habilitada
      if (storeSettings.drawerEnabled) {
        openCashDrawer(companyId, {
          enabled: true,
          model: storeSettings.drawerModel,
          pin: storeSettings.drawerPin,
          pulse: storeSettings.drawerPulse
        });
      }

      toast.success('Venda rápida finalizada!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao finalizar venda');
    } finally {
      setTefStatus('');
      setIsSubmitting(false);
    }
  }

  /** Fluxo antigo (demais lojas): botão por forma de pagamento finaliza direto. */
  async function handleFinish(methodName: string) {
    const method = pdvPaymentMethods.find(m => m.name.toLowerCase().includes(methodName.toLowerCase()));
    if (!method) {
      toast.error(`Forma de pagamento "${methodName}" não encontrada no PDV`);
      return;
    }
    await finishSale({ methodId: method.id, methodName: method.name });
  }

  return (
    <Card className="h-full flex flex-col border-l rounded-none shadow-none bg-muted/10">
      <CardContent className="p-4 flex flex-col h-full space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-lg">Venda Rápida</h2>
          {readingScale && <Badge variant="secondary" className="animate-pulse">Lendo Balança...</Badge>}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar ou Bipar (Atalho)..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {query && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg">
              <ScrollArea className="max-h-60">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between items-center"
                    onClick={() => handleAddProduct(p)}
                  >
                    <span>{p.name}</span>
                    <span className="font-bold">
                      {p.price > 0 ? formatPrice(p.price) : <span className="text-muted-foreground italic text-xs">sem preço</span>}
                    </span>
                  </button>
                ))}
              </ScrollArea>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.id} className="bg-background border rounded-lg p-2 text-sm">
                <div className="font-medium truncate">{item.product_name}</div>
                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center tabular-nums">{item.quantity.toFixed(item.quantity % 1 === 0 ? 0 : 3)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <div className="font-bold text-green-600">{formatPrice(item.unit_price * item.quantity)}</div>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm italic">
                Carrinho vazio
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="pt-4 border-t space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-muted-foreground text-sm font-medium">TOTAL</span>
            <span className="text-2xl font-black text-primary">{formatPrice(subtotal)}</span>
          </div>

          {isAmoreMio ? (
            <Button
              className="h-12 w-full font-bold"
              disabled={cart.length === 0 || isSubmitting}
              onClick={() => setPayOpen(true)}
            >
              <Wallet className="w-4 h-4 mr-2" />
              FINALIZAR VENDA
            </Button>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {pdvPaymentMethods.map((method) => {
                const nameLower = method.name.toLowerCase();
                const Icon = nameLower.includes('pix') ? QrCode : 
                            (nameLower.includes('cartao') || nameLower.includes('cartão') || nameLower.includes('tef')) ? CreditCard : 
                            (nameLower.includes('dinheiro') || nameLower.includes('especie')) ? Banknote : Wallet;
                
                const isCash = nameLower.includes('dinheiro') || nameLower.includes('especie');
                
                return (
                  <Button
                    key={method.id}
                    className={cn(
                      "h-12 text-xs font-bold w-full justify-start px-4",
                      isCash ? "bg-green-600 hover:bg-green-700 text-white" : ""
                    )}
                    variant={isCash ? "default" : "secondary"}
                    disabled={cart.length === 0 || isSubmitting}
                    onClick={() => handleFinish(method.name)}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {method.name.toUpperCase()}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>

      {/* Amore Mio: diálogo padrão de cobrança do PDV */}
      {isAmoreMio && (
        <>
          <PDVV2PaymentDialog
            open={payOpen}
            onOpenChange={setPayOpen}
            companyId={companyId}
            total={subtotal}
            title="Venda Rápida"
            channel="pdv"
            showDocumentMode
            tefStatus={tefStatus}
            printLayout={storeSettings.printLayout as any}
            onConfirm={async (params) => {
              await finishSale({
                methodId: params.paymentMethodId,
                methodName: params.paymentName,
                discount: params.discount,
                finalTotal: params.finalTotal,
                documentMode: params.documentMode as 'sale_only' | 'sale_with_nfce',
                printDocument: params.printDocument,
                tefOptions: params.tefOptions,
                tefIntegration: params.tefIntegration,
                customerDocument: params.customerDocument,
              });
            }}
          />

          <PDVV2NFCePostSaleDialog
            open={nfceDialogOpen}
            onOpenChange={setNfceDialogOpen}
            companyId={companyId}
            initialRecord={nfceRecord}
            autoPrint={nfceAutoPrint}
          />

          <Dialog open={!!pendingPriceProduct} onOpenChange={(o) => { if (!o) { setPendingPriceProduct(null); setPriceInput(''); } }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Informar preço</DialogTitle>
                <DialogDescription>
                  {pendingPriceProduct?.name} está cadastrado sem preço. Informe o valor de venda.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="fast-price">Preço (R$)</Label>
                <Input
                  id="fast-price"
                  autoFocus
                  inputMode="decimal"
                  placeholder="0,00"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmManualPrice(); }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPendingPriceProduct(null); setPriceInput(''); }}>Cancelar</Button>
                <Button onClick={confirmManualPrice}>Adicionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Card>
  );
}
