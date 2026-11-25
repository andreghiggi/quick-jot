import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';

function setup() {
  const storage = new Map<string, string>();
  let seq = 0;
  const persist = vi.fn(async (draft) => draft.sale.id);
  const errors: unknown[][] = [];
  const context = {
    companyId: 'bon', currentRegister: { id: 'register-4' }, persistFastSale: persist,
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    crypto: { randomUUID: () => `stable-${seq++}` }, setTimeout: (callback: () => void) => callback(),
    toast: { error: (...args: unknown[]) => errors.push(args), success: vi.fn() }, console: { error: vi.fn() }, fetchSales: vi.fn(async () => undefined),
  };
  return { run: checkoutHandler('src/hooks/useCashRegister.ts', 'addSale', context), persist, errors, storage, context };
}
const items = [{ product_id: 'xis', product_name: 'Mesa 4', quantity: 1, unit_price: 80 }];
describe('gravação centralizada — resposta incerta não duplica R$80', () => {
  it('descarta campos auxiliares ao criar o rascunho sem alterar IDs ou valores', async () => {
    const flow = setup();
    const selectedItems = [{ ...items[0], source_index: 0, _origIdx: 3, category: 'Lanches', notes: 'Sem tomate', taxRuleId: 'tax' }];
    await expect(flow.run(selectedItems, 'cash', 'operator')).resolves.toBe('stable-0');
    expect(flow.persist.mock.calls[0][0].items).toEqual([{
      id: 'stable-1', sale_id: 'stable-0', product_id: 'xis', product_name: 'Mesa 4',
      quantity: 1, unit_price: 80, total_price: 80,
    }]);
    expect(flow.persist.mock.calls[0][0].sale).toMatchObject({ payment_method_id: 'cash', final_total: 80 });
    expect(selectedItems[0].source_index).toBe(0);
  });
  it('três tentativas usam os mesmos IDs da venda e dos itens', async () => {
    const flow = setup();
    flow.persist.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce(new Error('items response lost'));
    await expect(flow.run(items, 'tef', 'operator')).resolves.toBe('stable-0');
    expect(flow.persist).toHaveBeenCalledTimes(3);
    const drafts = flow.persist.mock.calls.map(args => args[0]);
    expect(drafts.map(draft => draft.sale.id)).toEqual(['stable-0', 'stable-0', 'stable-0']);
    expect(drafts.map(draft => draft.items[0].id)).toEqual(['stable-1', 'stable-1', 'stable-1']);
    expect(drafts[0].sale.final_total).toBe(80);
  });
  it('nova chamada após falha completa retoma a mesma venda pendente', async () => {
    const flow = setup();
    flow.persist.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network'));
    await expect(flow.run(items, 'tef', 'operator')).resolves.toBeNull();
    await expect(flow.run(items, 'tef', 'operator')).resolves.toBe('stable-0');
    expect(flow.persist.mock.calls.map(args => args[0].sale.id)).toEqual(['stable-0', 'stable-0', 'stable-0', 'stable-0']);
    expect(flow.storage.size).toBe(0);
  });
  it('nova venda legítima idêntica após sucesso recebe novo ID', async () => {
    const flow = setup();
    await expect(flow.run(items, 'cash', 'operator')).resolves.toBe('stable-0');
    await expect(flow.run(items, 'cash', 'operator')).resolves.toBe('stable-2');
  });
});