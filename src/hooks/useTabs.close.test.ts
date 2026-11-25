import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
function setup(count: number | null = 0, failure?: 'count' | 'table' | 'close') {
  const updates: string[] = [];
  const scopes: string[] = [];
  const context = { companyId: 'bon', tabs: [{ id: 'tab-4', table_id: 'table-4' }], fetchTabs: vi.fn(async () => undefined),
    toast: { error: vi.fn(), success: vi.fn() }, console: { error: vi.fn() }, supabase: { from: (table: string) => {
      let updating = false;
      const q = { update: () => { updating = true;updates.push(table);return q; },
        eq: (field: string, value: string) => { if (field === 'company_id') scopes.push(value);return q; },
        select: () => q,
        then: (resolve: (result: unknown) => unknown) => resolve({ data: failure === 'close' ? [] : [{ id: 'tab-4' }], count,
          error: failure === (updating ? table === 'tables' ? 'table' : 'close' : 'count') ? new Error('network') : null }) };
      return q;
    } } };
  return { run: checkoutHandler('src/hooks/useTabs.ts', 'closeTab', context), context, updates, scopes };
}
describe('fechamento real — mesa somente livre após conferência', () => {
  it('mantém Mesa 4 ocupada quando resta outra comanda aberta', async () => {
    const flow = setup(1); await expect(flow.run('tab-4')).resolves.toBe(true);expect(flow.updates).toEqual(['tabs']);
  });
  it('libera Mesa 4 ao fechar a última comanda, sempre na loja atual', async () => {
    const flow = setup();await expect(flow.run('tab-4')).resolves.toBe(true);expect(flow.updates).toEqual(['tabs', 'tables']);
    expect(flow.scopes).toEqual(['bon', 'bon', 'bon']);
  });
  it('falha ao contar outras comandas não libera a mesa', async () => {
    const flow = setup(null, 'count');await expect(flow.run('tab-4')).resolves.toBe(false);expect(flow.updates).toEqual(['tabs']);
  });
  it('não afirma fechamento se a mesa não foi liberada', async () => {
    const flow = setup(0, 'table');await expect(flow.run('tab-4')).resolves.toBe(false);expect(flow.context.toast.success).not.toHaveBeenCalled();
  });
});