import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { parseFloristStockConfig, planStockAdjustments } from './floristStock';

const items = [
  { productId: 'rosa', quantity: 2 },
  { productId: 'rosa', quantity: 1 },
  { productId: 'vaso', quantity: 1 },
  { productId: '', quantity: 5 },
];

describe('baixa de estoque dos pedidos florais', () => {
  it('baixa a quantidade de cada produto ao confirmar', () => {
    expect(planStockAdjustments(items, [], true)).toEqual([
      { productId: 'rosa', delta: -3 },
      { productId: 'vaso', delta: -1 },
    ]);
  });

  it('não baixa de novo quando o pedido já foi baixado', () => {
    const applied = [{ product_id: 'rosa', quantity: -3 }, { product_id: 'vaso', quantity: '-1' }];
    expect(planStockAdjustments(items, applied, true)).toEqual([]);
  });

  it('devolve exatamente o que saiu ao cancelar ou excluir', () => {
    const applied = [{ product_id: 'rosa', quantity: -3 }, { product_id: 'vaso', quantity: -1 }];
    expect(planStockAdjustments(items, applied, false)).toEqual([
      { productId: 'rosa', delta: 3 },
      { productId: 'vaso', delta: 1 },
    ]);
  });

  it('não devolve nada de um pedido que nunca baixou estoque', () => {
    expect(planStockAdjustments(items, [], false)).toEqual([]);
  });

  it('não devolve duas vezes um pedido já estornado', () => {
    const applied = [{ product_id: 'rosa', quantity: -3 }, { product_id: 'rosa', quantity: 3 }];
    expect(planStockAdjustments([{ productId: 'rosa', quantity: 3 }], applied, false)).toEqual([]);
  });

  it('completa só o que faltou quando uma baixa ficou pela metade', () => {
    expect(planStockAdjustments(items, [{ product_id: 'rosa', quantity: -3 }], true)).toEqual([
      { productId: 'vaso', delta: -1 },
    ]);
  });

  it('a baixa começa desligada e só liga quando a loja ligar', () => {
    expect(parseFloristStockConfig(null).deductOnOrders).toBe(false);
    expect(parseFloristStockConfig('{}').deductOnOrders).toBe(false);
    expect(parseFloristStockConfig('{"deductOnOrders":true}').deductOnOrders).toBe(true);
  });
});
