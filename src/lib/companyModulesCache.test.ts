import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = { n: 0 };
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => {
          calls.n++;
          return { data: [{ module_name: 'pdv_v2', enabled: true }], error: null };
        },
      }),
    }),
  },
}));

import { getCompanyModuleRow, invalidateCompanyModules } from './companyModulesCache';

describe('companyModulesCache', () => {
  beforeEach(() => { calls.n = 0; invalidateCompanyModules(); });

  it('várias verificações simultâneas fazem uma única consulta', async () => {
    const r = await Promise.all([
      getCompanyModuleRow('c1', 'pdv_v2'),
      getCompanyModuleRow('c1', 'mercado'),
      getCompanyModuleRow('c1', 'financeiro'),
    ]);
    expect(calls.n).toBe(1);
    expect(r[0].data?.enabled).toBe(true);
    expect(r[1].data).toBeNull();
  });

  it('após invalidar, consulta de novo', async () => {
    await getCompanyModuleRow('c1', 'pdv_v2');
    invalidateCompanyModules('c1');
    await getCompanyModuleRow('c1', 'pdv_v2');
    expect(calls.n).toBe(2);
  });
});
