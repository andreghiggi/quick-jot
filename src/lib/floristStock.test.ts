import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { findStockShortages, parseFloristStockConfig, planStockAdjustments, stockShortageMessage } from './floristStock';

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

  it('vender com estoque zerado continua permitido até a loja desligar', () => {
    expect(parseFloristStockConfig(null).allowZeroStockSale).toBe(true);
    expect(parseFloristStockConfig('{"deductOnOrders":true}').allowZeroStockSale).toBe(true);
    expect(parseFloristStockConfig('{"allowZeroStockSale":false}').allowZeroStockSale).toBe(false);
  });

  it('com a venda sem saldo desligada, bloqueia só o que passa do estoque controlado', () => {
    const rosa = { id: 'rosa', name: 'Rosa', trackStock: true, stockQuantity: 2 };
    const vaso = { id: 'vaso', name: 'Vaso', trackStock: true, stockQuantity: 0 };
    const cartao = { id: 'cartao', name: 'Cartão', trackStock: false, stockQuantity: 0 };
    const blocked = { deductOnOrders: true, allowZeroStockSale: false };
    expect(findStockShortages([{ product: rosa, quantity: 2 }, { product: cartao, quantity: 5 }], blocked)).toEqual([]);
    const shortages = findStockShortages(
      [{ product: rosa, quantity: 2 }, { product: rosa, quantity: 1 }, { product: vaso, quantity: 1 }], blocked);
    expect(shortages.map((s) => [s.productId, s.available, s.requested])).toEqual([['rosa', 2, 3], ['vaso', 0, 1]]);
    expect(stockShortageMessage(shortages[0])).toBe('"Rosa" tem só 2 em estoque.');
    expect(stockShortageMessage(shortages[1])).toBe('"Vaso" está sem estoque.');
  });

  it('com a venda sem saldo permitida, nada é bloqueado', () => {
    const vaso = { id: 'vaso', name: 'Vaso', trackStock: true, stockQuantity: 0 };
    expect(findStockShortages([{ product: vaso, quantity: 3 }], { deductOnOrders: true, allowZeroStockSale: true })).toEqual([]);
  });
});
