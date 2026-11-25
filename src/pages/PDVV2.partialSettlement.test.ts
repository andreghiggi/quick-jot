import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
import { canCloseItemPayment, paymentCents } from '@/utils/tabPaymentRules';
function setup() {
  const events: string[] = [], stored = new Map<string, string>();
  const tab = { id: 'tab-4', tab_number: 4, table: { number: 4 }, items: [{ id: 'item', tab_id: 'tab-4', product_id: 'xis', product_name: 'Xis', quantity: 2, unit_price: 40, total_price: 80, created_by: 'operator', paid: false }] };
  const persisted = { items: [{ quantity: 1, unit_price: 40, total_price: 40, paid: false }] };
  const query = { select: () => query, eq: () => query, single: async () => ({ data: persisted, error: null }) };
  const apply = vi.fn(async (_plan: unknown) => { events.push('baixa'); });
  const sale = vi.fn(async () => { events.push('venda');return 'sale-40'; });
  const emit = vi.fn(async (_args: unknown) => { events.push('fiscal'); });
  const close = vi.fn(async () => { events.push('fechamento');return true; });
  const noOp = vi.fn();
  const ctx = { confirmImportTabI9GuardRef: { current: false }, pendingI9PaymentRef: { current: null },
    importingTab: { id: 'tab-4', tabNumber: 4 }, i9OriginalTabId: null, i9SplitInfo: null,
    user: { id: 'operator' }, companyId: 'bon', currentRegister: { id: 'register' }, openTabs: [tab], fiscalEnabled: true,
    localStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
    setI9OriginalTabId: noOp, setI9SplitInfo: noOp, saveSplitProgress: noOp, refetchTabs: vi.fn(async () => undefined),
    setImportingTab: noOp, i9SplitTransitionRef: { current: false }, setTimeout: noOp,
    toast: { error: noOp, success: noOp }, console: { error: noOp }, crypto: { randomUUID: vi.fn(() => 'stable-paid-item') },
    supabase: { from: () => query }, applyTabPaymentMutations: apply, canCloseItemPayment, paymentCents,
    addSale: sale, emitNFCeAndOpenDialog: emit, closeTab: close, runTefPayment: vi.fn(),
  };
  return { run: checkoutHandler('src/pages/PDVV2.tsx', 'confirmImportTabI9', ctx), ctx, events, apply, sale, emit, close, persisted };
}
const base = { paymentMethodId: 'tef', paymentName: 'Débito', discount: 0, finalTotal: 40, documentMode: 'sale_with_nfce', extraItems: [], prechargedTef: { tefData: { nsu: 'approved', valor: 40 } } };
describe('handlers reais de divisão da Mesa 4', () => {
  it('1 de 2 pessoas pagou R$40: baixa antes da nota e mesa segue aberta', async () => {
    const flow = setup();await flow.run({ ...base, splitInfo: { perPerson: 40, totalPeople: 2 } });
    expect(flow.events).toEqual(['venda', 'baixa', 'fiscal']);expect(flow.close).not.toHaveBeenCalled();
    expect(flow.apply.mock.calls[0][0]).toMatchObject({ inserts: [{ id: 'sale-40', total_price: -40 }] });
  });
  it('última pessoa paga R$40: fechamento antes da nota', async () => {
    const flow = setup();flow.ctx.i9SplitInfo = { perPerson: 40, remaining: 1, total: 2 } as any;
    flow.persisted.items = [{ quantity: 1, unit_price: 0, total_price: 0, paid: false }];
    await checkoutHandler('src/pages/PDVV2.tsx', 'confirmImportTabI9', flow.ctx)(base);
    expect(flow.events).toEqual(['venda', 'baixa', 'fechamento', 'fiscal']);
  });
  it('baixa de 1 dos 2 itens mantém R$40 abertos e ocorre antes da nota', async () => {
    const flow = setup();await flow.run({ ...base, itemsInfo: [{ id: 'item', paidQty: 1 }] });
    expect(flow.events).toEqual(['venda', 'baixa', 'fiscal']);expect(flow.close).not.toHaveBeenCalled();
    expect(flow.apply.mock.calls[0][0]).toMatchObject({ updates: [{ values: { quantity: 1, total_price: 40 } }] });
  });
  it('baixa incerta retoma o mesmo plano sem registrar ou cobrar R$40 outra vez', async () => {
    const flow = setup();flow.apply.mockRejectedValueOnce(new Error('response lost'));
    const params = { ...base, itemsInfo: [{ id: 'item', paidQty: 1 }] };
    await expect(flow.run(params)).rejects.toThrow('sem passar o cartão');
    await flow.run(params);
    expect(flow.sale).toHaveBeenCalledTimes(1);expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();
    expect(flow.apply.mock.calls[0][0]).toEqual(flow.apply.mock.calls[1][0]);
    expect(flow.emit.mock.calls[0][0]).toMatchObject({ saleId: 'sale-40' });
  });
});