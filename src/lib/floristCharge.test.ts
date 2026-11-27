import { describe, expect, it } from 'vitest';
import { floristCanCharge, floristUnpaidDeliveryWarning } from './floristCharge';

describe('cobrança dos pedidos florais', () => {
  it('libera Cobrar em qualquer etapa, para entrega ou retirada', () => {
    for (const status of ['pending', 'preparing', 'ready', 'delivered']) {
      expect(floristCanCharge({ chargeEnabled: true, origin: 'cardapio', status })).toBe(true);
      expect(floristCanCharge({ chargeEnabled: true, origin: 'balcao', status })).toBe(true);
    }
  });

  it('não cobra pedido cancelado nem loja sem cobrança ativa', () => {
    expect(floristCanCharge({ chargeEnabled: true, origin: 'balcao', status: 'canceled' })).toBe(false);
    expect(floristCanCharge({ chargeEnabled: true, origin: 'balcao', status: 'pending', cancelled: true })).toBe(false);
    expect(floristCanCharge({ chargeEnabled: false, origin: 'balcao', status: 'ready' })).toBe(false);
  });

  it('avisa só quando uma entrega não cobrada sai ou é entregue', () => {
    expect(floristUnpaidDeliveryWarning({ mode: 'delivery', target: 'out_for_delivery', unpaid: true })).toBe(true);
    expect(floristUnpaidDeliveryWarning({ mode: 'delivery', target: 'delivered', unpaid: true })).toBe(true);
    expect(floristUnpaidDeliveryWarning({ mode: 'delivery', target: 'delivered', unpaid: false })).toBe(false);
    expect(floristUnpaidDeliveryWarning({ mode: 'pickup', target: 'picked_up', unpaid: true })).toBe(false);
  });
});
