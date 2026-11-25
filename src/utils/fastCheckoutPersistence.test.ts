import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistFastSale, type FastSaleDraft } from './fastCheckoutPersistence';

const store = vi.hoisted(() => ({
  sales: new Map<string, unknown>(), items: new Map<string, unknown>(),
  failItems: false, failRead: false, filters: [] as Array<[string, unknown]>,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({
    upsert: async (rows: Record<string, unknown> | Array<Record<string, unknown>>, options: { ignoreDuplicates: boolean }) => {
      if (table === 'pdv_sale_items' && store.failItems) { store.failItems = false; return { error: new Error('network') }; }
      const target = table === 'pdv_sales' ? store.sales : store.items;
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        if (!options.ignoreDuplicates || !target.has(String(row.id))) target.set(String(row.id), row);
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
beforeEach(() => { store.sales.clear(); store.items.clear(); store.failItems = false; store.failRead = false; });
describe('venda rápida sem duplicação após falha de persistência', () => {
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