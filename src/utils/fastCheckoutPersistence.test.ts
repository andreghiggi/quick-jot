import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistFastSale, type FastSaleDraft } from './fastCheckoutPersistence';
import { checkoutHandler } from '@/test/checkoutHandler';

const store = vi.hoisted(() => ({
  sales: new Map<string, unknown>(), items: new Map<string, unknown>(),
  failItems: false, failAfterFirstItem: false, failRead: false, filters: [] as Array<[string, unknown]>,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({
    upsert: async (rows: Record<string, unknown> | Array<Record<string, unknown>>, options: { ignoreDuplicates: boolean }) => {
      if (table === 'pdv_sale_items' && store.failItems) { store.failItems = false; return { error: new Error('network') }; }
      if (table === 'pdv_sale_items') {
        const allowed = ['id', 'sale_id', 'product_id', 'product_name', 'quantity', 'unit_price', 'total_price'];
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          const extra = Object.keys(row).find(key => !allowed.includes(key));
          if (extra) return { error: new Error(`Unknown column: ${extra}`) };
        }
      }
      const target = table === 'pdv_sales' ? store.sales : store.items;
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        if (!options.ignoreDuplicates || !target.has(String(row.id))) target.set(String(row.id), row);
        if (table === 'pdv_sale_items' && store.failAfterFirstItem) {
          store.failAfterFirstItem = false;
          return { error: new Error('response lost') };
        }
      }
      return { error: null };
    },
    select: () => {
      store.filters = [];
      const query = {
        eq: (key: string, value: unknown) => { store.filters.push([key, value]); return query; },
        single: async () => ({ data: store.failRead ? null : { id: 'sale-80' }, error: store.failRead ? new Error('tenant') : null }),
      };
      return query;
    },
  }),
} }));
const draft: FastSaleDraft = {
  sale: { id: 'sale-80', company_id: 'bon', cash_register_id: 'register', payment_method_id: 'tef', total: 80, discount: 0, final_total: 80, notes: 'approved', created_by: 'operator' },
  items: [{ id: 'item-80', sale_id: 'sale-80', product_id: null, product_name: 'Venda', quantity: 1, unit_price: 80, total_price: 80 }],
};
beforeEach(() => { store.sales.clear(); store.items.clear(); store.failItems = false; store.failAfterFirstItem = false; store.failRead = false; });
describe('venda rápida sem duplicação após falha de persistência', () => {
  it('limpa rascunho antigo serializado sem modificar a venda, os itens ou dados TEF', async () => {
    const legacy = JSON.parse(JSON.stringify({
      sale: draft.sale,
      items: [{ ...draft.items[0], source_index: 0, category: 'Lanches', notes: 'Sem tomate', _origIdx: 4, taxRuleId: 'tax' }],
    }));
    const before = JSON.stringify(legacy);
    await expect(persistFastSale(legacy)).resolves.toBe('sale-80');
    expect(store.items.get('item-80')).toEqual(draft.items[0]);
    expect(store.sales.get('sale-80')).toEqual(draft.sale);
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it('completa itens restantes após resposta incerta mantendo uma venda de R$80', async () => {
    const legacy = {
      sale: draft.sale,
      items: [
        { ...draft.items[0], id: 'xis-especial', product_name: 'Xis Especial', unit_price: 44, total_price: 44, source_index: 0 },
        { ...draft.items[0], id: 'xis-salada', product_name: 'Xis Salada (Sem tomate)', unit_price: 24, total_price: 24, source_index: 1 },
        { ...draft.items[0], id: 'coca', product_name: 'Coca Cola 1L', unit_price: 12, total_price: 12, source_index: 2 },
      ],
    };
    store.failAfterFirstItem = true;
    await expect(persistFastSale(legacy)).rejects.toThrow('response lost');
    expect(store.sales.size).toBe(1);
    expect(store.items.size).toBe(1);
    await expect(persistFastSale(legacy)).resolves.toBe('sale-80');
    await expect(persistFastSale(legacy)).resolves.toBe('sale-80');
    expect(store.sales.size).toBe(1);
    expect(store.items.size).toBe(3);
    expect([...store.items.keys()]).toEqual(['xis-especial', 'xis-salada', 'coca']);
    expect([...store.items.values()].reduce((sum: number, item: any) => sum + item.total_price, 0)).toBe(80);
  });
  it('botão de tentar registrar retoma o rascunho legado em dinheiro sem gerar novos IDs', async () => {
    const selectedItems = [{ product_id: null, product_name: 'Venda', quantity: 1, unit_price: 80, source_index: 0 }];
    const cashSale = { ...draft.sale, payment_method_id: 'cash', customer_name: null };
    const legacy = { sale: cashSale, items: [{ ...draft.items[0], source_index: 0 }] };
    const insertData = {
      company_id: 'bon', cash_register_id: 'register', payment_method_id: 'cash',
      total: 80, discount: 0, final_total: 80, customer_name: null, notes: 'approved', created_by: 'operator',
    };
    const fingerprint = JSON.stringify({ insertData, items: selectedItems });
    const storage = new Map<string, string>([['pending_sale_bon', JSON.stringify({ draft: legacy, fingerprint })]]);
    const randomUUID = vi.fn(() => 'unexpected-new-id');
    let retry: (() => void) | undefined;
    const refetchedItems: unknown[] = [];
    const run = checkoutHandler('src/hooks/useCashRegister.ts', 'addSale', {
      companyId: 'bon', currentRegister: { id: 'register' }, persistFastSale,
      localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
      crypto: { randomUUID }, setTimeout: (callback: () => void) => callback(),
      toast: { error: (_message: string, options: { action?: { onClick: () => void } }) => { retry = options.action?.onClick; }, success: vi.fn() },
      console: { error: vi.fn() }, fetchSales: vi.fn(async () => { refetchedItems.push(...store.items.values()); }),
    });
    store.failRead = true;
    await expect(run(selectedItems, 'cash', 'operator', 0, undefined, 'approved')).resolves.toBeNull();
    expect(store.sales.size).toBe(1);
    expect(store.items.size).toBe(0);
    store.failRead = false;
    expect(retry).toBeTypeOf('function');
    retry?.();
    await vi.waitFor(() => expect(storage.size).toBe(0));
    expect(store.sales.size).toBe(1);
    expect(store.sales.get('sale-80')).toEqual(cashSale);
    expect(refetchedItems).toEqual([draft.items[0]]);
    expect(randomUUID).not.toHaveBeenCalled();
  });
  it('retoma os mesmos IDs após salvar venda mas falhar nos itens', async () => {
    store.failItems = true;
    await expect(persistFastSale(draft)).rejects.toThrow('network');
    await expect(persistFastSale(draft)).resolves.toBe('sale-80');
    expect(store.sales.size).toBe(1); expect(store.items.size).toBe(1);
    expect(store.sales.get('sale-80')).toMatchObject({ final_total: 80 });
  });
  it('resposta repetida não duplica nem sobrescreve venda e itens', async () => {
    await persistFastSale(draft); await persistFastSale(draft);
    expect(store.sales.size).toBe(1); expect(store.items.size).toBe(1);
  });
  it('confere loja e caixa antes de gravar os itens', async () => {
    store.failRead = true;
    await expect(persistFastSale(draft)).rejects.toThrow('tenant');
    expect(store.filters).toEqual([['id', 'sale-80'], ['company_id', 'bon'], ['cash_register_id', 'register']]);
    expect(store.items.size).toBe(0);
  });
});