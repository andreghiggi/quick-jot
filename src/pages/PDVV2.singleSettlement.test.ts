import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
function setup() {
  const events: string[] = [], storage = new Map<string, string>();
  const noOp = vi.fn();
  const ctx = { confirmImportTabGuardRef: { current: false }, paidImportRef: { current: null },
    importingTab: { id: 'tab-4' }, user: { id: 'operator' }, currentRegister: { id: 'register' }, companyId: 'bon', readSplitProgress: () => ({}),
    openTabs: [{ id: 'tab-4', tab_number: 4, table: { number: 4 }, items: [{ product_id: 'xis', product_name: 'Mesa 4', quantity: 1, unit_price: 80 }] }],
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    addSale: vi.fn(async () => { events.push('venda');return 'sale-80'; }), closeTab: vi.fn(async () => { events.push('fechar');return true; }),
    emitNFCeAndOpenDialog: vi.fn(async () => { events.push('fiscal');return false; }),
    printOnlyReceipt: vi.fn(async () => { events.push('recibo');throw new Error('printer offline'); }),
    fiscalEnabled: true, settings: {}, toast: { error: noOp, success: noOp }, console: { error: noOp },
    setImportingTab: noOp, setPendingPostSale: noOp, runTefPayment: vi.fn(),
  };
  return { ctx, events, run: checkoutHandler('src/pages/PDVV2.tsx', 'confirmImportTab', ctx) };
}
const params = { paymentMethodId: 'cash', paymentName: 'Dinheiro', discount: 0, finalTotal: 80, documentMode: 'sale_only', extraItems: [] };
describe('cobrança integral — fechamento independente do papel', () => {
  it('impressora offline não mantém a mesa aberta após R$80 pagos', async () => {
    const flow = setup();await flow.run(params);expect(flow.events).toEqual(['venda', 'fechar', 'recibo']);
    expect(flow.ctx.setImportingTab).toHaveBeenCalledWith(null);
  });
  it('falha ao fechar retoma venda e TEF já aprovados sem cobrar de novo', async () => {
    const flow = setup();flow.ctx.closeTab.mockResolvedValueOnce(false);
    const paid = { ...params, paymentMethodId: 'tef', documentMode: 'sale_with_nfce', prechargedTef: { tefData: { nsu: 'approved', valor: 80 } } };
    await expect(flow.run(paid)).rejects.toThrow('sem passar o cartão');await flow.run(paid);
    expect(flow.ctx.addSale).toHaveBeenCalledTimes(1);expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();
    expect(flow.ctx.emitNFCeAndOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ saleId: 'sale-80', tefData: { nsu: 'approved', valor: 80 } }));
  });
});