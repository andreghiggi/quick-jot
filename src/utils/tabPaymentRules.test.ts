import { describe, expect, it } from 'vitest';
import { canCloseItemPayment, splitChargeAllowed, splitSettlementComplete } from './tabPaymentRules';

describe('divisão de mesas aprovada', () => {
  it('R$ 50 de R$ 102 deixa R$ 52 e não finaliza em dinheiro', () => {
    expect(splitChargeAllowed(102, [], 50, 2)).toBe(true);
    expect(splitSettlementComplete(102, [50], 2)).toBe(false);
    expect(splitChargeAllowed(102, [50], 52, 2)).toBe(true);
    expect(splitSettlementComplete(102, [50, 52], 2)).toBe(true);
  });
  it('não permite quitar divisão em uma única cobrança de R$ 102', () => {
    expect(splitChargeAllowed(102, [], 102, 2)).toBe(false);
    expect(splitSettlementComplete(102, [102], 2)).toBe(false);
  });
  it('três cobranças finalizam apenas depois da terceira', () => {
    expect(splitSettlementComplete(102, [30, 40], 2)).toBe(false);
    expect(splitSettlementComplete(102, [30, 40, 32], 2)).toBe(true);
    expect(splitChargeAllowed(102, [30, 40], 32.01, 2)).toBe(false);
  });
  it('item adicional de R$ 20 continua no total de R$ 122', () => {
    expect(splitSettlementComplete(102 + 20, [50, 52], 2)).toBe(false);
    expect(splitSettlementComplete(102 + 20, [50, 72], 2)).toBe(true);
  });
  it('não fecha enquanto existir fração ou outro item não pago', () => {
    expect(canCloseItemPayment([{ paid: true, quantity: .5, unit_price: 102 }, { paid: false, quantity: .5, unit_price: 102 }])).toBe(false);
    expect(canCloseItemPayment([{ paid: true, quantity: 1, unit_price: 102 }, { paid: false, quantity: 1, unit_price: 20 }])).toBe(false);
  });
  it('não fecha por saldo zerado se ainda houver item pendente', () => {
    expect(canCloseItemPayment([{ paid: false, quantity: 1, unit_price: 102 }, { paid: false, quantity: 1, unit_price: -102 }])).toBe(false);
    expect(canCloseItemPayment([{ paid: true, quantity: 1, unit_price: 102 }])).toBe(true);
  });
  it('preserva consumidor legado de uma única cobrança e centavos exatos', () => {
    expect(splitChargeAllowed(102, [], 102)).toBe(true);
    expect(splitSettlementComplete(.3, [.1, .2], 2)).toBe(true);
  });
});