import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
import { expressCheckoutPolicy } from '@/utils/checkoutSettlement';

function setup() {
  const noOp = vi.fn();
  const tef = { nsu: 'approved-nsu', autorizacao: 'auth', bandeira: 'visa', tipo_pagamento: 'debit', valor: 80 };
  const addSale = vi.fn(async () => 'sale-80');
  const addOrder = vi.fn(async () => ({ id: 'order-80', shortCode: 'R-005', orderCode: 'order', dailyNumber: 5 }));
  const emit = vi.fn(async () => undefined);
  const read = { select: () => read, eq: () => read, maybeSingle: async () => ({ data: null }) };
  const ctx = {
    canGoNext: () => true, handleSubmitGuardRef: { current: false }, setIsSubmitting: noOp,
    activePaymentMethods: [{ id: 'tef', name: 'TEF', integration_type: 'tef_pinpad' }], paymentMethod: 'tef', total: 80,
    deliveryType: 'retirada', deliveryAddress: '', deliveryNumber: '', deliveryComplement: '', deliveryNeighborhood: '', deliveryReference: '',
    company: { id: 'bon', name: 'Bon Appetit' }, currentRegister: { id: 'register' },
    approvedDirectTefRef: { current: { tefData: tef, note: 'TEF PinPad: NSU approved-nsu' } },
    submittedOrderRef: { current: null }, submittedSaleRef: { current: null },
    supabase: { auth: { getUser: async () => ({ data: { user: { id: 'operator' } } }) }, from: () => read },
    toast: { error: noOp, success: noOp }, console: { error: noOp },
    pdvV2Enabled: true, isCashSelected: false, changeFor: '', cart: [{ product: { id: 'xis', name: 'Mesa 4', price: 80 }, quantity: 1, selectedOptionals: [] }],
    settings: { drawerEnabled: false, autoPrintProductionTicket: false, printLayout: 'v1' },
    isAmoreMio: false, customerName: 'Cliente', phoneDigits: '51999999999',
    addOrder, addSale, upsertCustomerBestEffort: noOp, fiscalEnabled: true, expressCheckoutPolicy,
    setIsEmittingNfce: noOp, products: [], taxRules: [], mercadoEnabled: false, buildNfceFiscalFields: () => ({}), emitirNFCe: emit,
    setNfceRecord: noOp, setNfceAutoPrint: noOp, isI9Company: false, setNfceDialogOpen: noOp, printOnlyReceipt: vi.fn(async () => undefined),
    resetForm: noOp, onOpenChange: noOp, crypto: { randomUUID: () => 'item-80' },
    runTefPayment: vi.fn(),
  };
  return { run: checkoutHandler('src/components/PedidoExpressDialog.tsx', 'handleSubmit', ctx), ctx, addSale, addOrder, emit, tef };
}
describe('handler real Express — TEF direto aprovado sem override', () => {
  it('salva venda de R$80 vinculada ao pedido e emite com dados TEF', async () => {
    const flow = setup();
    await flow.run();
    expect(flow.addSale).toHaveBeenCalledWith([{ product_id: 'xis', product_name: 'Mesa 4', quantity: 1, unit_price: 80 }],
      'tef', 'operator', 0, 'Cliente', expect.stringContaining('approved-nsu'), 'order-80');
    expect(flow.emit).toHaveBeenCalledWith('bon', 'sale-80', expect.objectContaining({ external_id: 'EXPRESS-sale-80', tef: flow.tef }));
    expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();
  });
  it('retoma cadastro sem repetir pedido ou pagamento após falha no caixa', async () => {
    const flow = setup();
    flow.addSale.mockResolvedValueOnce(null as any);
    await flow.run(); await flow.run();
    expect(flow.addOrder).toHaveBeenCalledTimes(1);
    expect(flow.addSale).toHaveBeenCalledTimes(2);
    expect(flow.emit).toHaveBeenCalledTimes(1);
    expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();
  });
  it('caixa fechado bloqueia antes de criar pedido ou cobrar', async () => {
    const flow = setup(); flow.ctx.currentRegister = null as any;
    const run = checkoutHandler('src/components/PedidoExpressDialog.tsx', 'handleSubmit', flow.ctx);
    await run();
    expect(flow.addOrder).not.toHaveBeenCalled(); expect(flow.addSale).not.toHaveBeenCalled(); expect(flow.emit).not.toHaveBeenCalled();
  });
  it('TEF novo sem módulo fiscal bloqueia antes do pedido e da cobrança', async () => {
    const flow = setup(); flow.ctx.fiscalEnabled = false; flow.ctx.approvedDirectTefRef.current = null as any;
    await checkoutHandler('src/components/PedidoExpressDialog.tsx', 'handleSubmit', flow.ctx)();
    expect(flow.addOrder).not.toHaveBeenCalled();expect(flow.addSale).not.toHaveBeenCalled();expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();
  });
});