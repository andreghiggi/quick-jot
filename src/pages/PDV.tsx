import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCashRegister, PdvSaleItem } from '@/hooks/useCashRegister';
import { useTabs, Tab } from '@/hooks/useTabs';
import { useTables } from '@/hooks/useTables';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { emitirNFCe, consultarNFCe, reprocessarNFCe, NFCeItem, NFCeTefData, printDanfeFromRecord, NFCeRecord } from '@/services/nfceService';
import { 
  isMultiplusCardConfigured, 
  sendPaymentToMultiplusCard, 
  checkMultiplusCardTransactionStatus,
  abortMultiplusCardSale,
  MultiplusCardPaymentResponse 
} from '@/services/multiplusCardService';
import {
  isPinpadConfigured,
  sendPinpadPayment,
  pollPinpadStatus,
  confirmPinpadTransaction,
  cancelPinpadTransaction,
  reversePinpadTransaction,
  PinpadTransactionResult,
} from '@/services/pinpadService';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Minus, 
  Trash2, 
  DollarSign, 
  ShoppingCart, 
  X,
  Printer,
  CircleDollarSign,
  Lock,
  Unlock,
  Search,
  Package,
  History,
  CreditCard,
  Receipt,
  Split,
  Loader2,
  Users,
  Table2,
  ClipboardList,
  Import,
  CheckCircle,
  Plug
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PixQRCodeDialog } from '@/components/pos/PixQRCodeDialog';

interface CartItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export default function PDV() {
  const { user, company } = useAuthContext();
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });
  const { activePaymentMethods, loading: paymentLoading } = usePaymentMethods({ companyId: company?.id });
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const { settings: storeSettings, updateSetting } = useStoreSettings({ companyId: company?.id });
  const { openTabs, getTabTotal, closeTab } = useTabs({ companyId: company?.id });
  const { tables } = useTables({ companyId: company?.id });
  const { 
    currentRegister, 
    registers,
    sales, 
    loading: registerLoading, 
    totalSales,
    salesCount,
    openRegister, 
    closeRegister, 
    reopenRegister,
    addSale,
    deleteSale,
    refetch: refetchSales
  } = useCashRegister({ companyId: company?.id });

  const mesasEnabled = isModuleEnabled('mesas');

  // TEF Multiplus Card (SmartPOS) state
  const [tefEnabled, setTefEnabled] = useState(false);
  const [tefProcessing, setTefProcessing] = useState(false);
  const [tefStatus, setTefStatus] = useState<string>('');
  const [tefResult, setTefResult] = useState<MultiplusCardPaymentResponse | null>(null);

  // TEF PinPad state
  const [pinpadEnabled, setPinpadEnabled] = useState(false);
  const [pinpadResult, setPinpadResult] = useState<PinpadTransactionResult | null>(null);
  const tefCancelRef = useRef(false);
  const tefIdentifierRef = useRef<string>('');
  const tefHashRef = useRef<string>('');

  // TEF mode: 'smartpos' or 'pinpad' — auto-selected based on what's configured
  const [tefMode, setTefMode] = useState<'smartpos' | 'pinpad'>('smartpos');

  useEffect(() => {
    if (company?.id) {
      isMultiplusCardConfigured(company.id).then(enabled => {
        setTefEnabled(enabled);
        if (enabled) setTefMode('smartpos');
      });
      isPinpadConfigured(company.id).then(enabled => {
        setPinpadEnabled(enabled);
        if (enabled && !tefEnabled) setTefMode('pinpad');
      });
    }
  }, [company?.id]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);

  // TEF payment options
  const [tefCardType, setTefCardType] = useState<'credit' | 'debit' | 'pix'>('credit');
  const [tefInstallmentMode, setTefInstallmentMode] = useState<'avista' | 'parcelado'>('avista');
  const [tefInstallments, setTefInstallments] = useState('2');

  const [documentMode, setDocumentMode] = useState<'sale_only' | 'sale_with_nfce'>(() => {
    const saved = localStorage.getItem('pdv_document_mode');
    return (saved === 'sale_with_nfce' ? 'sale_with_nfce' : 'sale_only');
  });

  // Persist documentMode to localStorage
  useEffect(() => {
    localStorage.setItem('pdv_document_mode', documentMode);
  }, [documentMode]);
  const emitNFCe = documentMode === 'sale_with_nfce';

  // NFC-e post-sale dialog
  const [nfcePostSaleDialog, setNfcePostSaleDialog] = useState(false);
  const [nfcePostSaleRecord, setNfcePostSaleRecord] = useState<any>(null);
  const [nfcePolling, setNfcePolling] = useState(false);
  const [nfceStatus, setNfceStatus] = useState<string>('processando');
  const [nfceCountdown, setNfceCountdown] = useState(10);
  const [nfcePrinting, setNfcePrinting] = useState(false);
  const [nfceRetryCount, setNfceRetryCount] = useState(0);

  // NFC-e status tracking for sales list
  const [salesNfceStatus, setSalesNfceStatus] = useState<Record<string, { status: string; loading: boolean }>>({});
  
  // TEF estorno state
  const [tefEstornoLoading, setTefEstornoLoading] = useState<string | null>(null);

  // PIX QR Code state
  const [pixQrDialog, setPixQrDialog] = useState(false);
  // Dialog states
  const [openRegisterDialog, setOpenRegisterDialog] = useState(false);
  const [closeRegisterDialog, setCloseRegisterDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [salesDialog, setSalesDialogRaw] = useState(false);
  
  // When sales dialog opens, load NFC-e statuses for all sales
  const setSalesDialog = async (open: boolean) => {
    setSalesDialogRaw(open);
    if (open && sales.length > 0) {
      const saleIds = sales.map(s => s.id);
      const { data: nfceRecords } = await supabase
        .from('nfce_records')
        .select('sale_id, status')
        .in('sale_id', saleIds);
      
      if (nfceRecords) {
        const statusMap: Record<string, { status: string; loading: boolean }> = {};
        nfceRecords.forEach((r: any) => {
          if (r.sale_id) statusMap[r.sale_id] = { status: r.status, loading: false };
        });
        setSalesNfceStatus(statusMap);
      }
    }
  };
  const [tabsDialog, setTabsDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [importedTab, setImportedTab] = useState<Tab | null>(null);
  
  // Payment state - support for split payment and division by people
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  const [secondPaymentMethod, setSecondPaymentMethod] = useState<string | null>(null);
  const [firstPaymentAmount, setFirstPaymentAmount] = useState('');
  const [divideByPeople, setDivideByPeople] = useState(false);
  const [numberOfPeople, setNumberOfPeople] = useState('2');
  const [peoplePaying, setPeoplePaying] = useState<Array<{
    name: string;
    amount: string;
    paymentMethodId: string;
  }>>([]);

  // NFC-e polling and countdown for post-sale dialog
  useEffect(() => {
    if (!nfcePostSaleDialog || !nfcePostSaleRecord) return;
    
    // If NFC-e is still processing, poll for updates
    if (nfceStatus === 'processando' || nfceStatus === 'pendente') {
      setNfcePolling(true);
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        // Alternate: odd polls just check DB, even polls also consult external API
        // First poll always consults external API for fastest response
        const shouldConsultApi = pollCount <= 2 || pollCount % 2 === 0;
        
        if (shouldConsultApi && nfcePostSaleRecord.nfce_id && company?.id) {
          try {
            await consultarNFCe(company.id, nfcePostSaleRecord.nfce_id);
          } catch (e) {
            console.error('[PDV] NFC-e consult error during polling:', e);
          }
        }

        // Read the updated record from DB
        const { data } = await supabase
          .from('nfce_records')
          .select('*')
          .eq('id', nfcePostSaleRecord.id)
          .maybeSingle();
        
        if (data) {
          setNfcePostSaleRecord(data);
          const status = data.status || 'processando';
          
          // If rejected and haven't retried yet, auto-retry once
          if ((status === 'rejeitada' || status === 'erro') && nfceRetryCount < 1) {
            console.log('[PDV] NFC-e rejected, auto-retrying (attempt', nfceRetryCount + 1, ')');
            setNfceRetryCount(prev => prev + 1);
            setNfceStatus('processando');
            toast.info('NFC-e rejeitada, tentando reenviar automaticamente...');
            
            try {
              if (data.nfce_id && company?.id) {
                await reprocessarNFCe(company.id, data.nfce_id);
              }
            } catch (retryErr) {
              console.error('[PDV] NFC-e retry error:', retryErr);
            }
            return;
          }
          
          setNfceStatus(status);
          
          if (status === 'autorizada' || status === 'rejeitada' || status === 'erro') {
            setNfcePolling(false);
            clearInterval(pollInterval);
            
            if (status === 'autorizada' && storeSettings.autoPrintNfce) {
              await printDanfeFromRecord(data as unknown as NFCeRecord);
              toast.success('DANFE impressa automaticamente');
            }
            
            if (status === 'rejeitada' || status === 'erro') {
              toast.error(`NFC-e ${status}: ${data.motivo_rejeicao || 'Verifique no Monitor NFC-e'}`);
            }
          }
        }
      }, 2000);
      
      return () => clearInterval(pollInterval);
    }
    
    // Countdown to close dialog (only after status resolved)
    if (nfceStatus !== 'processando' && nfceStatus !== 'pendente') {
      const autoHandled = (nfceStatus === 'autorizada' && storeSettings.autoPrintNfce);
      setNfceCountdown(autoHandled ? 3 : 10);
      const countdown = setInterval(() => {
        setNfceCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setNfcePostSaleDialog(false);
            setNfcePostSaleRecord(null);
            setNfceRetryCount(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdown);
    }
  }, [nfcePostSaleDialog, nfcePostSaleRecord, nfceStatus, nfceRetryCount, storeSettings.autoPrintNfce]);

  const loading = productsLoading || paymentLoading || registerLoading;

  const activeProducts = products.filter(p => p.active && p.pdvItem !== false);
  const categories = [...new Set(activeProducts.map(p => p.category))];

  const filteredProducts = activeProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const finalTotal = cartTotal - discount;

  // Detect if selected payment method has TEF integration
  const selectedMethodObj = activePaymentMethods.find(m => m.id === selectedPaymentMethod);
  const selectedMethodIntegration = (selectedMethodObj as any)?.integration_type as string | null | undefined;

  function addToCart(product: typeof products[0]) {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price
      }]);
    }
  }

  function updateQuantity(productId: string | null, delta: number) {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  }

  function removeFromCart(productId: string | null) {
    setCart(cart.filter(item => item.product_id !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setCustomerName('');
    setNotes('');
  }

  async function handleOpenRegister() {
    if (!user?.id) return;
    const amount = parseFloat(openingAmount.replace(',', '.')) || 0;
    const success = await openRegister(amount, user.id);
    if (success) {
      setOpenRegisterDialog(false);
      setOpeningAmount('');
    }
  }

  async function handleCloseRegister() {
    if (!user?.id) return;
    const amount = parseFloat(closingAmount.replace(',', '.')) || 0;
    const result = await closeRegister(amount, user.id, closingNotes || undefined);
    if (result) {
      setCloseRegisterDialog(false);
      setClosingAmount('');
      setClosingNotes('');
      // Optional: print summary
      printClosingSummary(result);
    }
  }

  async function handleReopenRegister(registerId: string) {
    await reopenRegister(registerId);
    setHistoryDialog(false);
  }

  function openPaymentDialog() {
    if (cart.length === 0) {
      toast.error('Adicione produtos ao carrinho');
      return;
    }
    if (activePaymentMethods.length === 0) {
      toast.error('Configure formas de pagamento primeiro');
      return;
    }
    setSelectedPaymentMethod(activePaymentMethods[0].id);
    setSecondPaymentMethod(null);
    setUseSplitPayment(false);
    setFirstPaymentAmount('');
    setDivideByPeople(false);
    setNumberOfPeople('2');
    setPeoplePaying([]);
    setPaymentDialog(true);
  }

  function handleImportTab(tab: Tab) {
    // Import items from tab to cart
    if (tab.items && tab.items.length > 0) {
      const importedItems: CartItem[] = tab.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price
      }));
      setCart(importedItems);
      setImportedTab(tab);
      setCustomerName(tab.customer_name || '');
      setNotes(`Comanda #${tab.tab_number}${tab.table ? ` - Mesa ${tab.table.number}` : ''}`);
      setTabsDialog(false);
      toast.success(`Comanda #${tab.tab_number} importada!`);
    } else {
      toast.error('Comanda sem itens');
    }
  }

  function initializePeoplePaying(count: number) {
    const people: typeof peoplePaying = [];
    const amountPerPerson = (finalTotal / count).toFixed(2);
    for (let i = 0; i < count; i++) {
      people.push({
        name: `Pessoa ${i + 1}`,
        amount: amountPerPerson,
        paymentMethodId: activePaymentMethods[0]?.id || ''
      });
    }
    setPeoplePaying(people);
  }

  function updatePersonPayment(index: number, field: 'name' | 'amount' | 'paymentMethodId', value: string) {
    setPeoplePaying(prev => prev.map((p, i) => 
      i === index ? { ...p, [field]: value } : p
    ));
  }

  const totalPeoplePaying = peoplePaying.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const remainingAmount = finalTotal - totalPeoplePaying;

  async function handleFinalizeSale() {
    if (!user?.id || isProcessingSale) return;
    
    // Validation based on payment mode
    if (divideByPeople) {
      if (peoplePaying.length === 0 || Math.abs(remainingAmount) > 0.01) {
        toast.error('Verifique os valores de cada pessoa');
        return;
      }
    } else if (!selectedPaymentMethod) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }
    
    setIsProcessingSale(true);
    
    try {
      // Build notes based on payment type
      let saleNotes = notes || '';
      let tefData: NFCeTefData | undefined = undefined;
      
      if (divideByPeople) {
        const peopleDetails = peoplePaying.map(p => {
          const method = activePaymentMethods.find(m => m.id === p.paymentMethodId)?.name || 'N/A';
          return `${p.name}: ${formatCurrency(parseFloat(p.amount) || 0)} (${method})`;
        }).join(' | ');
        saleNotes = `${saleNotes ? saleNotes + ' | ' : ''}Dividido por ${peoplePaying.length} pessoas: ${peopleDetails}`;
      } else if (useSplitPayment && secondPaymentMethod) {
        const method1 = activePaymentMethods.find(m => m.id === selectedPaymentMethod)?.name;
        const method2 = activePaymentMethods.find(m => m.id === secondPaymentMethod)?.name;
        saleNotes = `${saleNotes ? saleNotes + ' | ' : ''}Pagamento dividido: ${formatCurrency(parseFloat(firstPaymentAmount) || 0)} (${method1}) + ${formatCurrency(secondPaymentAmount)} (${method2})`;
      }

      // ===== TEF: Run BEFORE creating the sale =====
      const integType = selectedMethodIntegration;
      const isTefPayment = (integType === 'tef_pinpad' || integType === 'tef_smartpos') && !divideByPeople;

      if (isTefPayment && company?.id) {
        const tefPaymentType = tefCardType;
        const installmentCount = tefInstallmentMode === 'parcelado' ? parseInt(tefInstallments) || 2 : 1;

        setTefProcessing(true);
        tefCancelRef.current = false;
        const usePinpad = integType === 'tef_pinpad';

        if (usePinpad) {
          // ===== PinPad TEF WebService Flow =====
          setTefStatus('Enviando para PinPad...');
          try {
            const createResult = await sendPinpadPayment(company!.id, {
              amount: finalTotal,
              paymentType: tefPaymentType,
              installments: installmentCount,
            });

            if (!createResult.success || !createResult.hash) {
              toast.error(`Erro TEF PinPad: ${createResult.errorMessage}`);
              setTefProcessing(false);
              setTefStatus('');
              setIsProcessingSale(false);
              return; // ABORT — sale NOT created
            }

            tefHashRef.current = createResult.hash;

            // Poll for result (max 120s)
            setTefStatus('Aguardando pagamento no PinPad...');
            let tefCompleted = false;

            for (let i = 0; i < 120 && !tefCompleted; i++) {
              if (tefCancelRef.current) {
                toast.info('Operação TEF cancelada pelo operador.');
                await cancelPinpadTransaction(company!.id, {
                  identificacao: String(Date.now()),
                });
                setTefProcessing(false);
                setTefStatus('');
                setIsProcessingSale(false);
                tefHashRef.current = '';
                return;
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const statusResult = await pollPinpadStatus(company!.id, createResult.hash!);
              
              if (statusResult.status === 'processing') {
                setTefStatus('Processando pagamento no PinPad...');
              } else if (statusResult.status === 'approved' && statusResult.success) {
                tefCompleted = true;
                setPinpadResult(statusResult);
                setTefStatus('Pagamento aprovado!');
                toast.success(`TEF PinPad aprovado! NSU: ${statusResult.nsu}`);
                
                await confirmPinpadTransaction(company!.id, {
                  identificacao: String(Date.now()),
                  rede: statusResult.acquirer,
                  nsu: statusResult.nsu,
                  finalizacao: statusResult.finalizacao,
                });
                
                tefData = {
                  nsu: statusResult.nsu || '',
                  autorizacao: statusResult.authorizationCode || '',
                  bandeira: statusResult.cardBrand || '',
                  adquirente: statusResult.acquirer || '',
                  tipo_pagamento: tefPaymentType,
                  valor: finalTotal,
                };
                
                const installLabel = installmentCount > 1 ? ` | ${installmentCount}x ${tefCardType === 'credit' ? 'Crédito' : 'Débito'}` : ` | ${tefCardType === 'credit' ? 'Crédito à Vista' : tefCardType === 'debit' ? 'Débito' : 'PIX'}`;
                saleNotes = `${saleNotes ? saleNotes + ' | ' : ''}TEF PinPad: NSU ${statusResult.nsu} | Aut ${statusResult.authorizationCode} | ${statusResult.cardBrand} | ${statusResult.acquirer}${installLabel}`;
              } else if (statusResult.status === 'declined' || statusResult.status === 'cancelled' || statusResult.status === 'error') {
                tefCompleted = true;
                toast.error(`TEF PinPad: ${statusResult.errorMessage || statusResult.operatorMessage || 'Pagamento não aprovado'}`);
                setTefProcessing(false);
                setTefStatus('');
                setIsProcessingSale(false);
                return; // ABORT — sale NOT created
              }
            }
            
            if (!tefCompleted) {
              toast.warning('Timeout aguardando resposta do PinPad.');
              setTefProcessing(false);
              setTefStatus('');
              setIsProcessingSale(false);
              return; // ABORT
            }
          } catch (tefError: any) {
            console.error('[PDV] TEF PinPad error:', tefError);
            toast.error(`Erro TEF PinPad: ${tefError.message || 'Erro desconhecido'}`);
            setTefProcessing(false);
            setTefStatus('');
            setIsProcessingSale(false);
            return; // ABORT
          }
        } else {
          // ===== SmartPOS (PINPDV) Flow =====
          setTefStatus('Enviando para maquininha...');
          try {
            const tefIdentifier = `pdv-${Date.now()}`;
            tefIdentifierRef.current = tefIdentifier;
            const createResult = await sendPaymentToMultiplusCard(company!.id, {
              amount: finalTotal,
              paymentType: tefPaymentType,
              installments: installmentCount,
              identifier: tefIdentifier,
              description: customerName ? `Venda - ${customerName}` : 'Venda PDV',
            });

            if (!createResult.success) {
              toast.error(`Erro TEF: ${createResult.errorMessage}`);
              setTefProcessing(false);
              setTefStatus('');
              setIsProcessingSale(false);
              return; // ABORT
            }

            setTefStatus('Aguardando pagamento na maquininha...');
            let tefCompleted = false;
            for (let i = 0; i < 60 && !tefCompleted; i++) {
              if (tefCancelRef.current) {
                toast.info('Operação TEF cancelada pelo operador.');
                await abortMultiplusCardSale(company!.id, tefIdentifier, true);
                setTefProcessing(false);
                setTefStatus('');
                setIsProcessingSale(false);
                tefIdentifierRef.current = '';
                return;
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const statusResult = await checkMultiplusCardTransactionStatus(company!.id, tefIdentifier);
              
              if (statusResult.status === 'processing') {
                setTefStatus('Processando pagamento...');
              } else if (statusResult.status === 'approved' && statusResult.success) {
                tefCompleted = true;
                setTefResult(statusResult);
                setTefStatus('Pagamento aprovado!');
                toast.success(`TEF aprovado! NSU: ${statusResult.nsu}`);
                
                tefData = {
                  nsu: statusResult.nsu || '',
                  autorizacao: statusResult.authorizationCode || '',
                  bandeira: statusResult.cardBrand || '',
                  adquirente: statusResult.acquirer || '',
                  tipo_pagamento: tefPaymentType,
                  valor: finalTotal,
                };
                
                const installLabelSmart = installmentCount > 1 ? ` | ${installmentCount}x ${tefCardType === 'credit' ? 'Crédito' : 'Débito'}` : ` | ${tefCardType === 'credit' ? 'Crédito à Vista' : tefCardType === 'debit' ? 'Débito' : 'PIX'}`;
                saleNotes = `${saleNotes ? saleNotes + ' | ' : ''}TEF: NSU ${statusResult.nsu} | Aut ${statusResult.authorizationCode} | ${statusResult.cardBrand}${installLabelSmart}`;
              } else if (statusResult.status === 'cancelled' || statusResult.status === 'error') {
                tefCompleted = true;
                toast.error(`TEF: ${statusResult.errorMessage || 'Pagamento não aprovado'}`);
                setTefProcessing(false);
                setTefStatus('');
                setIsProcessingSale(false);
                return; // ABORT
              }
            }
            
            if (!tefCompleted) {
              toast.warning('Timeout aguardando resposta da maquininha.');
              setTefProcessing(false);
              setTefStatus('');
              setIsProcessingSale(false);
              return; // ABORT
            }
          } catch (tefError: any) {
            console.error('[PDV] TEF error:', tefError);
            toast.error(`Erro TEF: ${tefError.message || 'Erro desconhecido'}`);
            setTefProcessing(false);
            setTefStatus('');
            setIsProcessingSale(false);
            return; // ABORT
          }
        }

        setTefProcessing(false);
        setTefStatus('');
      }

      // ===== TEF approved (or not TEF) — now create the sale =====
      const primaryPaymentMethod = divideByPeople 
        ? peoplePaying[0]?.paymentMethodId || activePaymentMethods[0]?.id
        : selectedPaymentMethod;

      const saleId = await addSale(
        cart,
        primaryPaymentMethod!,
        user.id,
        discount,
        customerName || undefined,
        saleNotes || undefined
      );

      if (saleId) {
        let nfceEmitted = false;
        let emittedNfceId: string | null = null;

        // Emit NFC-e if checkbox was checked
        if (emitNFCe && company?.id && isModuleEnabled('fiscal')) {
          try {
            const nfceItems: NFCeItem[] = cart.map(item => {
              const product = products.find(p => p.id === item.product_id);
              const taxRule = product?.taxRuleId 
                ? taxRules.find(tr => tr.id === product.taxRuleId) 
                : null;

              return {
                codigo: item.product_id || 'AVULSO',
                descricao: item.product_name,
                ncm: taxRule?.ncm || '00000000',
                cfop: taxRule?.cfop || '5102',
                unidade: 'UN',
                quantidade: item.quantity,
                valor_unitario: item.unit_price,
                csosn: taxRule?.csosn || '102',
                aliquota_icms: taxRule?.icms_aliquot || 0,
                cst_pis: taxRule?.pis_cst || '49',
                aliquota_pis: taxRule?.pis_aliquot || 0,
                cst_cofins: taxRule?.cofins_cst || '49',
                aliquota_cofins: taxRule?.cofins_aliquot || 0,
              };
            });

            const externalId = `PDV-${currentRegister?.id?.substring(0, 8)}-${Date.now()}`;
            
            const nfceResult = await emitirNFCe(company.id, saleId, {
              external_id: externalId,
              itens: nfceItems,
              valor_desconto: discount || 0,
              valor_frete: 0,
              observacoes: customerName ? `Cliente: ${customerName}` : undefined,
              tef: tefData,
            });

            nfceEmitted = true;
            // Try to get nfce_id from the result - check multiple response structures
            const emitData = nfceResult?.data || nfceResult;
            if (emitData?.id) {
              emittedNfceId = emitData.id;
            }

            toast.success('NFC-e enviada para processamento!');
          } catch (nfceError: any) {
            console.error('[PDV] NFC-e emission error:', nfceError);
            toast.error(`Venda registrada, mas erro ao emitir NFC-e: ${nfceError.message || 'Erro desconhecido'}`);
          }
        }

        // If imported from tab, close the tab
        if (importedTab) {
          await closeTab(importedTab.id);
          setImportedTab(null);
        }
        setPaymentDialog(false);

        // Auto-print sale receipt if setting is enabled
        if (storeSettings.autoPrintSales && saleId) {
          // Find the sale that was just created to print it
          const { data: newSale } = await supabase
            .from('pdv_sales')
            .select('*, items:pdv_sale_items(*), payment_method:payment_methods(name)')
            .eq('id', saleId)
            .maybeSingle();
          if (newSale) {
            printSaleReceipt(newSale as any);
          }
        }

        clearCart();

        // Show post-sale NFC-e dialog if NFC-e was emitted
        if (nfceEmitted) {
          // Fetch the nfce_record that was just created
          const { data: nfceRecord } = await supabase
            .from('nfce_records')
            .select('*')
            .eq('sale_id', saleId)
            .maybeSingle();
          
          if (nfceRecord) {
            const initialStatus = nfceRecord.status || 'processando';
            setNfcePostSaleRecord(nfceRecord);
            setNfceRetryCount(0);
            
            // If already authorized from the emission response, skip polling entirely
            if (initialStatus === 'autorizada') {
              setNfceStatus('autorizada');
              if (storeSettings.autoPrintNfce) {
                await printDanfeFromRecord(nfceRecord as unknown as NFCeRecord);
                toast.success('NFC-e autorizada! DANFE impressa automaticamente.');
              }
            } else {
              setNfceStatus(initialStatus);
            }
            setNfcePostSaleDialog(true);
          }
        }
      }
    } finally {
      setIsProcessingSale(false);
    }
  }

  const secondPaymentAmount = useSplitPayment ? finalTotal - (parseFloat(firstPaymentAmount) || 0) : 0;

  function printClosingSummary(register: typeof currentRegister) {
    if (!register) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const salesByMethod = sales.reduce((acc, sale) => {
      const methodName = sale.payment_method?.name || 'Não informado';
      acc[methodName] = (acc[methodName] || 0) + sale.final_total;
      return acc;
    }, {} as Record<string, number>);

    const formattedOpenDate = new Date(register.opened_at).toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const diferenca = register.difference || 0;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Fechamento de Caixa</title>
        <style>
          @page { margin: 0; size: ${storeSettings.printerPaperSize} auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 12px;
            width: ${storeSettings.printerPaperSize};
            padding: 3mm;
          }
          .header { text-align: center; margin-bottom: 2mm; }
          .header h1 { font-size: 14px; font-weight: bold; }
          .header h2 { font-size: 16px; font-weight: bold; margin: 2mm 0; }
          .header p { font-size: 10px; }
          .divider { border-top: 1px dashed #000; margin: 2mm 0; }
          .section { margin: 2mm 0; }
          .section-title { font-weight: bold; font-size: 11px; margin-bottom: 1mm; }
          .row { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 11px; }
          .row.bold { font-weight: bold; font-size: 12px; }
          .row.total { font-size: 13px; font-weight: bold; margin: 2mm 0; }
          .row.negative { color: #c00; }
          .notes { font-size: 10px; margin: 2mm 0; }
          .footer { text-align: center; font-size: 9px; margin-top: 3mm; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${company?.name || 'PDV'}</h1>
          <h2>FECHAMENTO DE CAIXA</h2>
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row"><span>Abertura:</span><span>${formattedOpenDate}</span></div>
          <div class="row"><span>Fechamento:</span><span>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row"><span>Valor Inicial:</span><span>R$ ${register.opening_amount.toFixed(2)}</span></div>
          <div class="row"><span>Total em Vendas:</span><span>R$ ${totalSales.toFixed(2)}</span></div>
          <div class="row"><span>Qtd. Vendas:</span><span>${salesCount}</span></div>
        </div>
        <div class="divider"></div>
        <div class="section">
          <p class="section-title">POR FORMA DE PAGAMENTO:</p>
          ${Object.entries(salesByMethod).map(([method, total]) => 
            `<div class="row"><span>${method}:</span><span>R$ ${(total as number).toFixed(2)}</span></div>`
          ).join('')}
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row bold"><span>VALOR ESPERADO:</span><span>R$ ${((register.opening_amount || 0) + totalSales).toFixed(2)}</span></div>
          <div class="row"><span>Valor Informado:</span><span>R$ ${(register.closing_amount || 0).toFixed(2)}</span></div>
          <div class="row total ${diferenca < 0 ? 'negative' : ''}">
            <span>DIFERENÇA:</span>
            <span>R$ ${diferenca.toFixed(2)}</span>
          </div>
        </div>
        ${register.notes ? `<div class="divider"></div><p class="notes"><strong>Obs:</strong> ${register.notes}</p>` : ''}
        <div class="divider"></div>
        <p class="footer">Impresso em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  function printSaleReceipt(sale: typeof sales[0]) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const formattedDate = new Date(sale.created_at).toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Build payment condition line from TEF notes
    const saleNotesStr = sale.notes || '';
    let paymentConditionHtml = '';
    const installMatch = saleNotesStr.match(/(\d+)x (Crédito|Débito)/);
    if (installMatch) {
      const parcelas = parseInt(installMatch[1]);
      const valorParcela = (sale.final_total / parcelas).toFixed(2);
      paymentConditionHtml = '<p><strong>Condição:</strong> ' + installMatch[1] + 'x ' + installMatch[2] + ' de R$ ' + valorParcela + '</p>';
    } else {
      const avistaMatch = saleNotesStr.match(/(Crédito à Vista|Débito|PIX)/);
      if (avistaMatch) {
        paymentConditionHtml = '<p><strong>Condição:</strong> ' + avistaMatch[1] + '</p>';
      }
    }
    const isCancelled = saleNotesStr.includes('[CANCELADA]');
    const cancelledBanner = isCancelled ? '<p style="color:red;font-weight:bold;text-align:center;font-size:14px;margin:2mm 0">*** VENDA CANCELADA ***</p>' : '';

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cupom de Venda</title>
        <style>
          @page { margin: 0; size: ${storeSettings.printerPaperSize} auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 12px;
            width: ${storeSettings.printerPaperSize};
            padding: 3mm;
          }
          .header { text-align: center; margin-bottom: 2mm; }
          .header h1 { font-size: 14px; font-weight: bold; }
          .header h2 { font-size: 16px; font-weight: bold; margin: 2mm 0; }
          .header p { font-size: 10px; }
          .divider { border-top: 1px dashed #000; margin: 2mm 0; }
          .section { margin: 2mm 0; }
          .section p { margin: 1mm 0; font-size: 11px; }
          .items { margin: 2mm 0; }
          .item { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 11px; }
          .item-name { flex: 1; }
          .item-price { text-align: right; }
          .total-section { margin-top: 2mm; }
          .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
          .subtotal { display: flex; justify-content: space-between; font-size: 11px; margin: 1mm 0; }
          .notes { font-size: 10px; margin: 2mm 0; }
          .footer { text-align: center; font-size: 10px; margin-top: 3mm; }
        </style>
      </head>
      <body>
        ${cancelledBanner}
        <div class="header">
          <h1>${company?.name || 'PDV'}</h1>
          <h2>CUPOM DE VENDA</h2>
          <p>${formattedDate}</p>
        </div>
        <div class="divider"></div>
        ${sale.customer_name ? `<div class="section"><p><strong>Cliente:</strong> ${sale.customer_name}</p></div><div class="divider"></div>` : ''}
        <div class="items">
          ${sale.items?.map(item => `
            <div class="item">
              <span class="item-name">${item.quantity}x ${item.product_name}</span>
              <span class="item-price">R$ ${item.total_price.toFixed(2)}</span>
            </div>
          `).join('') || '<p>Sem itens</p>'}
        </div>
        <div class="divider"></div>
        <div class="total-section">
          <div class="subtotal"><span>Subtotal:</span><span>R$ ${sale.total.toFixed(2)}</span></div>
          ${sale.discount > 0 ? `<div class="subtotal"><span>Desconto:</span><span>- R$ ${sale.discount.toFixed(2)}</span></div>` : ''}
          <div class="total">
            <span>TOTAL:</span>
            <span>R$ ${sale.final_total.toFixed(2)}</span>
          </div>
        </div>
        <div class="divider"></div>
        <div class="section">
          <p><strong>Pagamento:</strong> ${sale.payment_method?.name || 'N/A'}</p>
          ${paymentConditionHtml}
        </div>
        ${saleNotesStr ? `<div class="divider"></div><p class="notes"><strong>Obs:</strong> ${saleNotesStr}</p>` : ''}
        <div class="divider"></div>
        <p class="footer">Obrigado pela preferência!</p>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  // Parse TEF data from sale notes
  function parseTefDataFromNotes(notes: string | null): { nsu: string; authCode: string; acquirer: string; cardBrand: string; type: 'pinpad' | 'smartpos' } | null {
    if (!notes) return null;
    // Match "TEF PinPad: NSU 123456 | Aut 789012 | VISA | Stone"
    const pinpadMatch = notes.match(/TEF PinPad: NSU (\S+) \| Aut (\S+) \| ([^|]+) \| (.+)/);
    if (pinpadMatch) {
      return { nsu: pinpadMatch[1], authCode: pinpadMatch[2], cardBrand: pinpadMatch[3].trim(), acquirer: pinpadMatch[4].trim(), type: 'pinpad' };
    }
    // Match "TEF: NSU 123456 | Aut 789012 | VISA"
    const smartposMatch = notes.match(/TEF: NSU (\S+) \| Aut (\S+) \| (.+)/);
    if (smartposMatch) {
      return { nsu: smartposMatch[1], authCode: smartposMatch[2], cardBrand: smartposMatch[3].trim(), acquirer: '', type: 'smartpos' };
    }
    return null;
  }

  // Mark a sale as cancelled in the database
  async function markSaleAsCancelled(saleId: string, currentNotes: string | null) {
    const cancelledNotes = `[CANCELADA] ${currentNotes || ''}`.trim();
    await supabase
      .from('pdv_sales')
      .update({ notes: cancelledNotes })
      .eq('id', saleId);
    // Refresh sales list via hook
    await refetchSales();
  }

  // Handle TEF estorno (cancel/reverse completed transaction)
  async function handleTefEstorno(sale: typeof sales[0]) {
    if (!company?.id) return;
    
    // Check if already cancelled
    if (sale.notes?.includes('[CANCELADA]')) {
      toast.error('Esta venda já foi estornada/cancelada');
      return;
    }
    
    const tefInfo = parseTefDataFromNotes(sale.notes);
    if (!tefInfo) {
      toast.error('Dados TEF não encontrados nesta venda');
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja estornar esta transação TEF?\n\nValor: ${formatCurrency(sale.final_total)}\nNSU: ${tefInfo.nsu}\nBandeira: ${tefInfo.cardBrand}`
    );
    if (!confirmed) return;

    setTefEstornoLoading(sale.id);

    try {
      if (tefInfo.type === 'pinpad') {
        // PinPad CNC flow
        const saleDate = new Date(sale.created_at);
        const dataTransacao = format(saleDate, 'ddMMyyyy');
        const horaTransacao = format(saleDate, 'HHmmss');

        const result = await reversePinpadTransaction(company.id, {
          amount: sale.final_total,
          nsu: tefInfo.nsu,
          rede: tefInfo.acquirer,
          dataTransacao,
          horaTransacao,
        });

        if (result.success) {
          // Poll for CNC result
          if (result.hash) {
            toast.info('Estorno enviado ao PinPad. Aguardando confirmação...');
            let completed = false;
            for (let i = 0; i < 60 && !completed; i++) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              const status = await pollPinpadStatus(company.id, result.hash);
              if (status.status === 'approved') {
                completed = true;
                toast.success(`Estorno aprovado! NSU: ${status.nsu}`);
                await markSaleAsCancelled(sale.id, sale.notes);
              } else if (status.status === 'declined' || status.status === 'error' || status.status === 'cancelled') {
                completed = true;
                toast.error(`Estorno recusado: ${status.errorMessage || status.operatorMessage || 'Não aprovado'}`);
              }
            }
            if (!completed) {
              toast.warning('Timeout aguardando resposta do estorno.');
            }
          } else {
            toast.success('Estorno enviado com sucesso!');
            await markSaleAsCancelled(sale.id, sale.notes);
          }
        } else {
          toast.error(`Erro no estorno: ${result.errorMessage}`);
        }
      } else {
        // SmartPOS — abort/cancel via Multiplus Card
        const success = await abortMultiplusCardSale(company.id, tefInfo.nsu, true);
        if (success) {
          toast.success('Estorno enviado para a maquininha!');
          await markSaleAsCancelled(sale.id, sale.notes);
        } else {
          toast.error('Erro ao enviar estorno para a maquininha');
        }
      }
    } catch (error) {
      console.error('[PDV] TEF estorno error:', error);
      toast.error('Erro ao processar estorno TEF');
    } finally {
      setTefEstornoLoading(null);
    }
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (loading) {
    return (
      <AppLayout title="PDV">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  // No register open - show open dialog
  if (!currentRegister) {
    return (
      <AppLayout title="PDV - Ponto de Venda">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
          <div className="text-center space-y-2">
            <Lock className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-2xl font-bold">Caixa Fechado</h2>
            <p className="text-muted-foreground">Abra o caixa para iniciar as vendas</p>
          </div>
          
          <div className="flex gap-4">
            <Button size="lg" onClick={() => setOpenRegisterDialog(true)} className="gap-2">
              <Unlock className="w-5 h-5" />
              Abrir Caixa
            </Button>
            <Button size="lg" variant="outline" onClick={() => setHistoryDialog(true)} className="gap-2">
              <History className="w-5 h-5" />
              Histórico
            </Button>
          </div>
        </div>

        {/* Open Register Dialog */}
        <Dialog open={openRegisterDialog} onOpenChange={setOpenRegisterDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abrir Caixa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Valor Inicial (Troco)</Label>
                <Input
                  type="text"
                  placeholder="0,00"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenRegisterDialog(false)}>Cancelar</Button>
              <Button onClick={handleOpenRegister}>Abrir Caixa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Histórico de Caixas</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3">
                {registers.map((reg) => (
                  <Card key={reg.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {reg.status === 'open' ? 'Aberto' : 
                              `Fechado em ${format(new Date(reg.closed_at!), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                            }
                          </p>
                          <p className="text-sm">
                            Inicial: {formatCurrency(reg.opening_amount)}
                            {reg.status === 'closed' && (
                              <> | Final: {formatCurrency(reg.closing_amount || 0)}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={reg.status === 'open' ? 'default' : 'secondary'}>
                            {reg.status === 'open' ? 'Aberto' : 'Fechado'}
                          </Badge>
                          {reg.status === 'closed' && (
                            <Button size="sm" variant="outline" onClick={() => handleReopenRegister(reg.id)}>
                              Reabrir
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {registers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Nenhum histórico encontrado</p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="PDV - Ponto de Venda">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[calc(100vh-8rem)]">
        {/* Products Section */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Search, Categories and Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {mesasEnabled && openTabs.length > 0 && (
                <Button variant="outline" className="gap-2" onClick={() => setTabsDialog(true)}>
                  <ClipboardList className="w-4 h-4" />
                  Comandas ({openTabs.length})
                </Button>
              )}
              <Button variant="outline" className="gap-2" onClick={() => setSalesDialog(true)}>
                <Receipt className="w-4 h-4" />
                Vendas ({salesCount})
              </Button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              Todos
            </Button>
            {categories.map(cat => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>

          {/* Products Grid */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-4">
              {filteredProducts.map(product => (
                <Card 
                  key={product.id} 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => addToCart(product)}
                >
                  <CardContent className="p-3">
                    {product.imageUrl ? (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-20 object-cover rounded-md mb-2"
                      />
                    ) : (
                      <div className="w-full h-20 bg-muted rounded-md mb-2 flex items-center justify-center">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-primary font-bold text-sm">
                      {formatCurrency(product.price)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Cart Section - Sticky/Fixed */}
        <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] flex flex-col gap-4">

          {/* Cart */}
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Carrinho
                  {cart.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </Badge>
                  )}
                </CardTitle>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCart}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
              {/* Scrollable Cart Items */}
              <ScrollArea className="flex-1 px-6">
                {cart.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    Carrinho vazio
                  </div>
                ) : (
                  <div className="space-y-2 py-2">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.product_name}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0) {
                                  setCart(cart.map((c, i) => i === idx ? { ...c, unit_price: val } : c));
                                }
                              }}
                              className="h-6 w-20 text-xs px-1"
                              step="0.01"
                            />
                            <span className="text-xs text-muted-foreground">x</span>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val > 0) {
                                  setCart(cart.map((c, i) => i === idx ? { ...c, quantity: val } : c));
                                }
                              }}
                              className="h-6 w-14 text-xs px-1"
                              min="1"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product_id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product_id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className="font-medium text-sm w-20 text-right">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </p>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeFromCart(item.product_id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Fixed Footer - Always visible */}
              {cart.length > 0 && (
                <div className="shrink-0 border-t bg-card px-6 py-4 space-y-3">
                  {/* Discount & Customer */}
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <Label className="text-xs whitespace-nowrap">Desconto:</Label>
                      <Input
                        type="number"
                        placeholder="0,00"
                        value={discount || ''}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        className="h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <Label className="text-xs whitespace-nowrap">Cliente:</Label>
                      <Input
                        placeholder="Nome"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="h-8"
                      />
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-destructive">
                        <span>Desconto:</span>
                        <span>-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total:</span>
                      <span className="text-primary">{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1 gap-2" size="lg" onClick={openPaymentDialog}>
                      <DollarSign className="w-5 h-5" />
                      Finalizar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Forma de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Divide by People Toggle */}
            <div className="flex items-center space-x-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <Checkbox 
                id="divide-people" 
                checked={divideByPeople}
                onCheckedChange={(checked) => {
                  setDivideByPeople(!!checked);
                  setUseSplitPayment(false);
                  if (checked) {
                    initializePeoplePaying(parseInt(numberOfPeople) || 2);
                  }
                }}
              />
              <label htmlFor="divide-people" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                <Users className="w-4 h-4" />
                Dividir conta por pessoas
              </label>
            </div>

            {/* Divide by People Details */}
            {divideByPeople ? (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <Label>Número de pessoas:</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        const newCount = Math.max(2, (parseInt(numberOfPeople) || 2) - 1);
                        setNumberOfPeople(String(newCount));
                        initializePeoplePaying(newCount);
                      }}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="w-10 text-center font-bold text-lg">{numberOfPeople}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        const newCount = (parseInt(numberOfPeople) || 2) + 1;
                        setNumberOfPeople(String(newCount));
                        initializePeoplePaying(newCount);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => initializePeoplePaying(parseInt(numberOfPeople) || 2)}
                  >
                    Dividir Igual
                  </Button>
                </div>

                <div className="space-y-3">
                  {peoplePaying.map((person, index) => (
                    <div key={index} className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder={`Pessoa ${index + 1}`}
                          value={person.name}
                          onChange={(e) => updatePersonPayment(index, 'name', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Valor"
                          value={person.amount}
                          onChange={(e) => updatePersonPayment(index, 'amount', e.target.value)}
                          className="w-28"
                        />
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {activePaymentMethods.map(method => (
                          <Button
                            key={method.id}
                            size="sm"
                            variant={person.paymentMethodId === method.id ? 'default' : 'outline'}
                            onClick={() => updatePersonPayment(index, 'paymentMethodId', method.id)}
                          >
                            {method.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`p-3 rounded-lg ${Math.abs(remainingAmount) > 0.01 ? 'bg-destructive/10 border border-destructive' : 'bg-green-500/10 border border-green-500'}`}>
                  <div className="flex justify-between font-medium">
                    <span>Total das pessoas:</span>
                    <span>{formatCurrency(totalPeoplePaying)}</span>
                  </div>
                  {Math.abs(remainingAmount) > 0.01 && (
                    <div className="flex justify-between text-sm text-destructive mt-1">
                      <span>Diferença:</span>
                      <span>{formatCurrency(remainingAmount)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Primary Payment Method */}
                <div>
                  <Label className="mb-2 block">Forma de Pagamento</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {activePaymentMethods.map(method => {
                      const hasInteg = !!(method as any).integration_type;
                      return (
                        <Button
                          key={method.id}
                          variant={selectedPaymentMethod === method.id ? 'default' : 'outline'}
                          className="h-14 gap-2 relative"
                          onClick={() => setSelectedPaymentMethod(method.id)}
                        >
                          <CreditCard className="w-4 h-4" />
                          {method.name}
                          {hasInteg && (
                            <Plug className="w-3 h-3 absolute top-1 right-1 text-primary" />
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* TEF Options — shown when selected payment method has integration */}
                {selectedMethodIntegration && (selectedMethodIntegration === 'tef_pinpad' || selectedMethodIntegration === 'tef_smartpos') && (
                  <div className="p-3 border border-primary/30 bg-primary/5 rounded-lg space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Plug className="w-4 h-4 text-primary" />
                      Opções TEF
                    </p>
                    <div>
                      <Label className="mb-2 block text-xs">Tipo de Pagamento</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          variant={tefCardType === 'credit' ? 'default' : 'outline'}
                          onClick={() => setTefCardType('credit')}
                        >
                          Crédito
                        </Button>
                        <Button
                          size="sm"
                          variant={tefCardType === 'debit' ? 'default' : 'outline'}
                          onClick={() => { setTefCardType('debit'); setTefInstallmentMode('avista'); }}
                        >
                          Débito
                        </Button>
                        <Button
                          size="sm"
                          variant={tefCardType === 'pix' ? 'default' : 'outline'}
                          onClick={() => { setTefCardType('pix'); setTefInstallmentMode('avista'); }}
                        >
                          PIX
                        </Button>
                      </div>
                    </div>
                    {tefCardType === 'credit' && (
                      <div>
                        <Label className="mb-2 block text-xs">Modalidade</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant={tefInstallmentMode === 'avista' ? 'default' : 'outline'}
                            onClick={() => setTefInstallmentMode('avista')}
                          >
                            À Vista
                          </Button>
                          <Button
                            size="sm"
                            variant={tefInstallmentMode === 'parcelado' ? 'default' : 'outline'}
                            onClick={() => setTefInstallmentMode('parcelado')}
                          >
                            Parcelado
                          </Button>
                        </div>
                        {tefInstallmentMode === 'parcelado' && (
                          <div className="mt-2 space-y-1">
                            <Label className="text-xs">Parcelas</Label>
                            <Input
                              type="number"
                              min="2"
                              max="18"
                              value={tefInstallments}
                              onChange={(e) => setTefInstallments(e.target.value)}
                              className="h-9"
                            />
                            {parseInt(tefInstallments) >= 2 && (
                              <p className="text-xs text-muted-foreground">
                                {tefInstallments}x de {formatCurrency(finalTotal / (parseInt(tefInstallments) || 2))}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Split Payment Toggle */}
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                  <Checkbox 
                    id="split-payment" 
                    checked={useSplitPayment}
                    onCheckedChange={(checked) => {
                      setUseSplitPayment(!!checked);
                      if (checked && activePaymentMethods.length > 1) {
                        const otherMethod = activePaymentMethods.find(m => m.id !== selectedPaymentMethod);
                        setSecondPaymentMethod(otherMethod?.id || null);
                      }
                    }}
                  />
                  <label htmlFor="split-payment" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <Split className="w-4 h-4" />
                    Dividir em duas formas de pagamento
                  </label>
                </div>

                {/* Split Payment Details */}
                {useSplitPayment && (
                  <div className="space-y-3 p-3 border rounded-lg">
                    <div className="space-y-2">
                      <Label>Valor na 1ª forma ({activePaymentMethods.find(m => m.id === selectedPaymentMethod)?.name})</Label>
                      <Input
                        type="number"
                        placeholder="0,00"
                        value={firstPaymentAmount}
                        onChange={(e) => setFirstPaymentAmount(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label className="mb-2 block">Segunda Forma de Pagamento</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {activePaymentMethods.filter(m => m.id !== selectedPaymentMethod).map(method => (
                          <Button
                            key={method.id}
                            variant={secondPaymentMethod === method.id ? 'default' : 'outline'}
                            className="h-12 gap-2"
                            onClick={() => setSecondPaymentMethod(method.id)}
                          >
                            <CreditCard className="w-4 h-4" />
                            {method.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-muted/50 p-2 rounded text-sm">
                      <div className="flex justify-between">
                        <span>Valor na 2ª forma ({activePaymentMethods.find(m => m.id === secondPaymentMethod)?.name || '...'}):</span>
                        <span className="font-medium">{formatCurrency(secondPaymentAmount)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações da venda..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Document Generation Mode - only show if fiscal module enabled */}
            {isModuleEnabled('fiscal') && (
              <div className="p-3 bg-accent/50 rounded-lg border border-accent space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5" />
                  Geração de Documentos
                </p>
                <RadioGroup value={documentMode} onValueChange={(v) => setDocumentMode(v as 'sale_only' | 'sale_with_nfce')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sale_only" id="doc-sale-only" />
                    <label htmlFor="doc-sale-only" className="text-sm cursor-pointer">Somente Venda</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sale_with_nfce" id="doc-sale-nfce" />
                    <label htmlFor="doc-sale-nfce" className="text-sm cursor-pointer">Venda com NFC-e</label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {importedTab && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-sm">
                <p className="font-medium text-blue-700">
                  📋 Comanda #{importedTab.tab_number}
                  {importedTab.table && ` - Mesa ${importedTab.table.number}`}
                </p>
                <p className="text-muted-foreground">
                  A comanda será fechada automaticamente após o pagamento
                </p>
              </div>
            )}

            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between text-lg font-bold">
                <span>Total a Pagar:</span>
                <span className="text-primary">{formatCurrency(finalTotal)}</span>
              </div>
            </div>

            {tefProcessing && (
              <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{tefStatus || 'Processando TEF...'}</p>
                  <p className="text-xs text-muted-foreground">Use o botão abaixo para cancelar a operação</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {tefProcessing ? (
              <Button
                variant="destructive"
                onClick={() => {
                  tefCancelRef.current = true;
                  setTefStatus('Cancelando operação...');
                }}
                className="w-full h-14 text-lg"
              >
                <X className="w-5 h-5 mr-2" />
                Cancelar Operação TEF
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPaymentDialog(false)} disabled={isProcessingSale}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleFinalizeSale} 
                  disabled={
                    isProcessingSale || 
                    (divideByPeople 
                      ? (peoplePaying.length === 0 || Math.abs(remainingAmount) > 0.01)
                      : (!selectedPaymentMethod || (useSplitPayment && (!secondPaymentMethod || !firstPaymentAmount)))
                    )
                  }
                >
                  {isProcessingSale ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    'Confirmar Pagamento'
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Register Dialog */}
      <Dialog open={closeRegisterDialog} onOpenChange={setCloseRegisterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span>Valor Inicial:</span>
                <span>{formatCurrency(currentRegister?.opening_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total de Vendas:</span>
                <span>{formatCurrency(totalSales)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Valor Esperado:</span>
                <span className="text-primary">
                  {formatCurrency((currentRegister?.opening_amount || 0) + totalSales)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor em Caixa</Label>
              <Input
                type="text"
                placeholder="0,00"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações do fechamento..."
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseRegisterDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleCloseRegister}>
              <Printer className="w-4 h-4 mr-2" />
              Fechar e Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de Caixas</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3">
              {registers.map((reg) => (
                <Card key={reg.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {reg.status === 'open' ? 'Aberto' : 
                            `Fechado em ${format(new Date(reg.closed_at!), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                          }
                        </p>
                        <p className="text-sm">
                          Inicial: {formatCurrency(reg.opening_amount)}
                          {reg.status === 'closed' && (
                            <> | Final: {formatCurrency(reg.closing_amount || 0)}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={reg.status === 'open' ? 'default' : 'secondary'}>
                          {reg.status === 'open' ? 'Aberto' : 'Fechado'}
                        </Badge>
                        {reg.status === 'closed' && !currentRegister && (
                          <Button size="sm" variant="outline" onClick={() => handleReopenRegister(reg.id)}>
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {registers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum histórico encontrado</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Sales Dialog */}
      <Dialog open={salesDialog} onOpenChange={(open) => setSalesDialog(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Vendas Realizadas ({salesCount})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3">
              {sales.map((sale) => (
                <Card key={sale.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {format(new Date(sale.created_at), "HH:mm", { locale: ptBR })}
                          </p>
                          <Badge variant={sale.notes?.includes('[CANCELADA]') ? 'destructive' : 'outline'}>
                            {sale.notes?.includes('[CANCELADA]') ? 'CANCELADA' : (sale.payment_method?.name || 'N/A')}
                          </Badge>
                        </div>
                        {sale.customer_name && (
                          <p className="text-sm text-muted-foreground">Cliente: {sale.customer_name}</p>
                        )}
                        {sale.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{sale.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className={`font-bold ${sale.notes?.includes('[CANCELADA]') ? 'line-through text-muted-foreground' : 'text-primary'}`}>{formatCurrency(sale.final_total)}</p>
                          {sale.discount > 0 && (
                            <p className="text-xs text-muted-foreground">Desc: {formatCurrency(sale.discount)}</p>
                          )}
                        </div>
                        {isModuleEnabled('fiscal') && (() => {
                          const nfceInfo = salesNfceStatus[sale.id];
                          const hasNfce = !!nfceInfo;
                          const isGenerating = nfceInfo?.loading;
                          const nfceStatusText = nfceInfo?.status;
                          
                          if (hasNfce && !isGenerating) {
                            return (
                              <Badge 
                                variant={nfceStatusText === 'autorizada' ? 'success' : nfceStatusText === 'rejeitada' || nfceStatusText === 'erro' ? 'destructive' : 'outline'}
                                className="text-[10px] px-1.5"
                              >
                                {nfceStatusText === 'autorizada' ? '✅ NFC-e' : nfceStatusText === 'rejeitada' ? '❌ NFC-e' : `NFC-e: ${nfceStatusText}`}
                              </Badge>
                            );
                          }
                          
                          return (
                            <Button 
                              size="icon" 
                              variant="ghost"
                              disabled={isGenerating}
                              onClick={async () => {
                                if (isGenerating || hasNfce) return;
                                if (!company?.id) return;
                                
                                // Set loading state
                                setSalesNfceStatus(prev => ({ ...prev, [sale.id]: { status: 'processando', loading: true } }));
                                
                                try {
                                  const saleItems = sale.items || [];
                                  const nfceItems: NFCeItem[] = saleItems.map((item: any) => {
                                    const product = products.find(p => p.id === item.product_id);
                                    const taxRule = product?.taxRuleId 
                                      ? taxRules.find(tr => tr.id === product.taxRuleId) 
                                      : null;
                                    return {
                                      codigo: item.product_id || 'AVULSO',
                                      descricao: item.product_name,
                                      ncm: taxRule?.ncm || '00000000',
                                      cfop: taxRule?.cfop || '5102',
                                      unidade: 'UN',
                                      quantidade: item.quantity,
                                      valor_unitario: item.unit_price,
                                      csosn: taxRule?.csosn || '102',
                                      aliquota_icms: taxRule?.icms_aliquot || 0,
                                      cst_pis: taxRule?.pis_cst || '49',
                                      aliquota_pis: taxRule?.pis_aliquot || 0,
                                      cst_cofins: taxRule?.cofins_cst || '49',
                                      aliquota_cofins: taxRule?.cofins_aliquot || 0,
                                    };
                                  });

                                  const externalId = `PDV-${sale.cash_register_id?.substring(0, 8)}-${Date.now()}`;
                                  await emitirNFCe(company.id, sale.id, {
                                    external_id: externalId,
                                    itens: nfceItems,
                                    valor_desconto: sale.discount || 0,
                                    valor_frete: 0,
                                    observacoes: sale.customer_name ? `Cliente: ${sale.customer_name}` : undefined,
                                  });
                                  
                                  // Fetch the created record and open the post-sale dialog
                                  const { data: nfceRecord } = await supabase
                                    .from('nfce_records')
                                    .select('*')
                                    .eq('sale_id', sale.id)
                                    .maybeSingle();
                                  
                                  setSalesNfceStatus(prev => ({ ...prev, [sale.id]: { status: nfceRecord?.status || 'processando', loading: false } }));
                                  
                                  if (nfceRecord) {
                                    setSalesDialogRaw(false);
                                    setNfcePostSaleRecord(nfceRecord);
                                    setNfceRetryCount(0);
                                    const initialStatus = nfceRecord.status || 'processando';
                                    if (initialStatus === 'autorizada') {
                                      setNfceStatus('autorizada');
                                      if (storeSettings.autoPrintNfce) {
                                        await printDanfeFromRecord(nfceRecord as unknown as NFCeRecord);
                                        toast.success('NFC-e autorizada! DANFE impressa automaticamente.');
                                      }
                                    } else {
                                      setNfceStatus(initialStatus);
                                    }
                                    setNfcePostSaleDialog(true);
                                  }
                                  
                                  toast.success('NFC-e enviada para processamento!');
                                } catch (err: any) {
                                  setSalesNfceStatus(prev => ({ ...prev, [sale.id]: { status: 'erro', loading: false } }));
                                  toast.error(`Erro ao emitir NFC-e: ${err.message}`);
                                }
                              }}
                              title="Gerar NFC-e"
                            >
                              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                            </Button>
                          );
                        })()}
                        {parseTefDataFromNotes(sale.notes) && !sale.notes?.includes('[CANCELADA]') && (
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => handleTefEstorno(sale)}
                            disabled={tefEstornoLoading === sale.id}
                            title="Estornar TEF"
                            className="text-destructive hover:text-destructive"
                          >
                            {tefEstornoLoading === sale.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => printSaleReceipt(sale)}
                          title="Imprimir cupom"
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {sales.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhuma venda realizada</p>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <div className="flex justify-between w-full items-center">
              <p className="text-lg font-bold">Total: {formatCurrency(totalSales)}</p>
              <Button onClick={() => setSalesDialog(false)}>Fechar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs/Comandas Dialog */}
      {mesasEnabled && (
        <Dialog open={tabsDialog} onOpenChange={setTabsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Comandas Abertas ({openTabs.length})
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3">
                {openTabs.map((tab) => {
                  const tabTotal = getTabTotal(tab);
                  const tableName = tab.table ? `Mesa ${tab.table.number}` : 'Sem mesa';
                  return (
                    <Card key={tab.id} className="hover:border-primary transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">Comanda #{tab.tab_number}</p>
                              <Badge variant="outline">{tableName}</Badge>
                            </div>
                            {tab.customer_name && (
                              <p className="text-sm text-muted-foreground">Cliente: {tab.customer_name}</p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {tab.items?.length || 0} itens
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-bold text-lg text-primary">{formatCurrency(tabTotal)}</p>
                            </div>
                            <Button onClick={() => handleImportTab(tab)} className="gap-2">
                              <Import className="w-4 h-4" />
                              Importar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {openTabs.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Nenhuma comanda aberta</p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {/* NFC-e Post-Sale Dialog */}
      <Dialog open={nfcePostSaleDialog} onOpenChange={(open) => {
        if (!open) {
          setNfcePostSaleDialog(false);
          setNfcePostSaleRecord(null);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              NFC-e{nfcePostSaleRecord?.numero ? ` nº ${nfcePostSaleRecord.numero}` : ''} — {nfceStatus === 'autorizada' ? 'Autorizada' : nfceStatus === 'rejeitada' ? 'Rejeitada' : 'Processando...'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center">
            {nfcePolling ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Aguardando retorno da SEFAZ...
                </p>
              </div>
            ) : nfceStatus === 'autorizada' ? (
              storeSettings.autoPrintNfce ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <p className="text-sm text-muted-foreground">
                    ✅ NFC-e{nfcePostSaleRecord?.numero ? ` nº ${nfcePostSaleRecord.numero}` : ''} autorizada! DANFE impressa automaticamente.
                  </p>
                  <p className="text-xs text-muted-foreground">Fechando em {nfceCountdown}s...</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    ✅ NFC-e{nfcePostSaleRecord?.numero ? ` nº ${nfcePostSaleRecord.numero}` : ''} autorizada com sucesso! Deseja imprimir o DANFE?
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setNfcePostSaleDialog(false);
                        setNfcePostSaleRecord(null);
                      }}
                    >
                      Não ({nfceCountdown}s)
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!nfcePostSaleRecord) return;
                        setNfcePrinting(true);
                        try {
                          await printDanfeFromRecord(nfcePostSaleRecord as unknown as NFCeRecord);
                          toast.success('DANFE enviada para impressão');
                        } catch (e: any) {
                          toast.error(e.message || 'Erro ao imprimir DANFE');
                        } finally {
                          setNfcePrinting(false);
                          setNfcePostSaleDialog(false);
                          setNfcePostSaleRecord(null);
                        }
                      }}
                      disabled={nfcePrinting}
                      className="gap-2"
                    >
                      {nfcePrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                      Imprimir DANFE
                    </Button>
                  </div>
                </>
              )
            ) : (
              <>
                <p className="text-sm text-destructive">
                  ❌ NFC-e {nfceStatus === 'rejeitada' ? 'rejeitada' : 'com erro'}. Verifique no Monitor NFC-e.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNfcePostSaleDialog(false);
                    setNfcePostSaleRecord(null);
                  }}
                >
                  Fechar ({nfceCountdown}s)
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating settings panel */}
      {isModuleEnabled('fiscal') && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="shadow-lg border-2 p-3 space-y-3">
            {/* Document Generation Mode */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Geração de Documentos</p>
              <RadioGroup value={documentMode} onValueChange={(v) => setDocumentMode(v as 'sale_only' | 'sale_with_nfce')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sale_only" id="float-sale-only" />
                  <label htmlFor="float-sale-only" className="text-xs cursor-pointer">Somente Venda</label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sale_with_nfce" id="float-sale-nfce" />
                  <label htmlFor="float-sale-nfce" className="text-xs cursor-pointer">Venda com NFC-e</label>
                </div>
              </RadioGroup>
            </div>
            <Separator />
            {/* Auto-print */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Impressão Automática</p>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-print-sales"
                  checked={storeSettings.autoPrintSales}
                  onCheckedChange={async (checked) => {
                    await updateSetting('auto_print_sales', checked ? 'true' : 'false');
                  }}
                />
                <label htmlFor="auto-print-sales" className="text-xs cursor-pointer">Vendas</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-print-nfce"
                  checked={storeSettings.autoPrintNfce}
                  onCheckedChange={async (checked) => {
                    await updateSetting('auto_print_nfce', checked ? 'true' : 'false');
                  }}
                />
                <label htmlFor="auto-print-nfce" className="text-xs cursor-pointer">NFC-e</label>
              </div>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
