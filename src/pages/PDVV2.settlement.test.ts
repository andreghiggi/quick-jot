import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
import { paymentCents, splitSettlementComplete } from '@/utils/tabPaymentRules';

const noOp = () => undefined;
function setup(closed = true) {
  const events: string[] = [];
  const storage = new Map<string, string>();
  const tab = { id: 'tab-4', tab_number: 4, customer_name: null, table: { number: 4 },
    items: [{ product_id: 'xis', product_name: 'Mesa 4', quantity: 1, unit_price: 80, total_price: 80, paid: false }] };
  const data = { select: () => data, eq: () => data, maybeSingle: async () => ({ data: null }),
    single: async () => ({ data: tab, error: null }) };
  const charge = vi.fn(async () => { events.push('payment'); return { ok: true, primary: { payment_method_id: 'cash', payment_name: 'Dinheiro' }, lines: [{ amount: 50 }, { amount: 30 }] }; });
  const emit = vi.fn(async (_company: string, _sale: string, _payload: unknown) => { events.push('fiscal'); throw new Error('SEFAZ timeout'); });
  const add = vi.fn(async () => { events.push('sale'); return 'sale-80'; });
  const close = vi.fn(async () => { events.push('close'); return closed; });
  const ctx = {
    multiPayGuardRef: { current: false }, multiPaySaleRef: { current: null }, multiPayTab: { id: 'tab-4', total: 80 },
    multiPayTotal: 80, multiPayDraft: null, user: { id: 'operator' }, currentRegister: { id: 'register' }, companyId: 'bon',
    supabase: { from: (table: string) => table === 'pdv_sales' ? {
      ...data, single: async () => ({ data: { id: 'sale-80', final_total: 80 }, error: null }),
    } : data }, splitSettlementComplete, paymentCents,
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    runMultiPayment: charge, addSale: add, closeTab: close, recordSalePayments: vi.fn(async () => undefined),
    products: [], taxRules: [], mercadoEnabled: false, buildNfceFiscalFields: () => ({}), emitirNFCe: emit, buildPagamentosSplit: () => [],
    toast: { error: noOp, success: noOp }, console: { error: noOp },
    setMultiPayOpen: vi.fn(),
    ...Object.fromEntries(['setMultiPayProcessing', 'setMultiPayStatus', 'setMultiPayOpen', 'setMultiPayTab', 'setMultiPayDraft', 'setImportingTab',
      'setIsEmittingNfce', 'setNfceRecord', 'setNfceAutoPrint', 'setNfceDialogOpen'].map(name => [name, vi.fn()])),
  };
  return { run: checkoutHandler('src/pages/PDVV2.tsx', 'handleMultiPaymentImportTab', ctx), events, charge, add, emit, close, ctx, storage };
}
const payments = [{ payment_method_id: 'cash', payment_name: 'Dinheiro', amount: 50 }, { payment_method_id: 'tef', payment_name: 'TEF', amount: 30 }];
describe('handler real de cobrança multi da Mesa 4 — R$80', () => {
  it('fecha antes da transmissão e timeout não aborta a venda', async () => {
    const flow = setup();
    await expect(flow.run(payments, { wantsNfce: true })).resolves.toBeUndefined();
    expect(flow.events).toEqual(['payment', 'sale', 'close', 'fiscal']);
    expect(flow.ctx.setMultiPayOpen).toHaveBeenCalledWith(false);
    expect(flow.emit).toHaveBeenCalledWith('bon', 'sale-80', expect.objectContaining({ external_id: 'TAB-MULTI-sale-80' }));
  });
  it('falta de fechamento não suprime a NFC-e obrigatória', async () => {
    const flow = setup(false);
    await expect(flow.run(payments, { wantsNfce: true })).rejects.toThrow('sem cobrar');
    expect(flow.events).toEqual(['payment', 'sale', 'close', 'fiscal']);
    expect(flow.ctx.setMultiPayOpen).not.toHaveBeenCalledWith(false);
  });
  it('não permite finalizar com apenas R$50 de R$80', async () => {
    const flow = setup();
    await expect(flow.run(payments.slice(0, 1), { wantsNfce: true })).rejects.toThrow('saldo pendente');
    expect(flow.charge).not.toHaveBeenCalled(); expect(flow.close).not.toHaveBeenCalled();
  });
  it('após falha de fechamento retoma sem repetir o cartão ou a venda', async () => {
    const flow = setup(false);
    await expect(flow.run(payments, { wantsNfce: true })).rejects.toThrow();
    flow.close.mockImplementation(async () => { flow.events.push('close'); return true; });
    await flow.run(payments, { wantsNfce: true });
    expect(flow.events).toEqual(['payment', 'sale', 'close', 'fiscal', 'close']);
    expect(flow.charge).toHaveBeenCalledTimes(1); expect(flow.add).toHaveBeenCalledTimes(1);
  });
});