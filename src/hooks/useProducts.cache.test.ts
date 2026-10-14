import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { loadProductsShared, invalidateProductsCache } from './useProducts';

describe('catálogo compartilhado', () => {
  it('duas telas abrindo juntas para a mesma loja fazem uma única busca', async () => {
    invalidateProductsCache();
    const query = vi.fn(async () => [{ id: 'p1' } as any]);
    await Promise.all([
      loadProductsShared('loja-a', { force: true, dedupe: true, query }),
      loadProductsShared('loja-a', { force: true, dedupe: true, query }),
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('após salvar, busca de novo mesmo com outra em andamento', async () => {
    invalidateProductsCache();
    const query = vi.fn(async () => [] as any[]);
    await Promise.all([
      loadProductsShared('loja-b', { force: true, dedupe: true, query }),
      loadProductsShared('loja-b', { force: true, dedupe: false, query }),
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
