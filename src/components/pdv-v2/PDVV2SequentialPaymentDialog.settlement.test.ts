import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
describe('registro de cobrança sequencial concluída', () => {
  it('erro real da gravação não vira conclusão aprovada', async () => {
    const filters: Array<[string, string]> = [];
    const query = { eq: (key: string, value: string) => { filters.push([key, value]);return query; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: new Error('network') }) };
    const run = checkoutHandler('src/components/pdv-v2/PDVV2SequentialPaymentDialog.tsx', 'markCompleted', {
      openChargeId: 'charge-80', companyId: 'bon', cashRegisterId: 'register', supabase: { from: () => ({ update: () => query }) },
    });
    await expect(run()).rejects.toThrow('Não cobre novamente');
    expect(filters).toEqual([['id', 'charge-80'], ['company_id', 'bon'], ['cash_register_id', 'register']]);
  });
});