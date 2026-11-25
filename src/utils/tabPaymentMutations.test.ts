import { describe, beforeEach, expect, it, vi } from 'vitest';
import { applyTabPaymentMutations, type TabPaymentMutations } from './tabPaymentMutations';
const state = vi.hoisted(() => ({ row: { quantity: 2, total_price: 80 }, inserts: new Map<string, unknown>(), failInsert: false, failUpdate: false, tenant: true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const query = { eq: () => query, single: async () => ({ data: state.tenant ? { id: 'tab-4' } : null, error: null }),
    select: async () => ({ data: state.failUpdate ? [] : [{ id: 'item' }], error: null }) };
  return { select: () => query, update: (values: Record<string, number>) => {
    if (!state.failUpdate) Object.assign(state.row, values); return query;
  }, upsert: async (rows: Array<{ id: string }>) => {
    if (state.failInsert) { state.failInsert = false; return { error: new Error('response lost') }; }
    rows.forEach(row => { if (!state.inserts.has(row.id)) state.inserts.set(row.id, row); });return { error: null };
  } };
} } }));
const plan: TabPaymentMutations = { tabId: 'tab-4', companyId: 'bon',
  updates: [{ id: 'item', values: { quantity: 1, total_price: 40 } }],
  inserts: [{ id: 'paid-item', tab_id: 'tab-4', product_id: 'xis', product_name: 'Xis', unit_price: 40, quantity: 1, total_price: 40, created_by: 'operator', paid: true }] };
beforeEach(() => { state.row = { quantity: 2, total_price: 80 };state.inserts.clear();state.failInsert = false;state.failUpdate = false;state.tenant = true; });
describe('baixa persistida da parcela sem duplicar frações', () => {
  it('retoma o mesmo item de R$40, mantendo R$40 não pagos', async () => {
    state.failInsert = true;
    await expect(applyTabPaymentMutations(plan)).rejects.toThrow('response lost');
    await applyTabPaymentMutations(plan);await applyTabPaymentMutations(plan);
    expect(state.row).toEqual({ quantity: 1, total_price: 40 }); expect(state.inserts.size).toBe(1);
  });
  it('não conclui nem insere baixa quando atualização não foi confirmada', async () => {
    state.failUpdate = true;
    await expect(applyTabPaymentMutations(plan)).rejects.toThrow('não foi atualizado'); expect(state.inserts.size).toBe(0);
  });
  it('não toca itens se a comanda não pertence à loja atual', async () => {
    state.tenant = false; await expect(applyTabPaymentMutations(plan)).rejects.toThrow();expect(state.row.total_price).toBe(80);
  });
});