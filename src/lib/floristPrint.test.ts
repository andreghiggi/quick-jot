import { describe, it, expect } from 'vitest';
import { floristReadyLabel, floristItemFees, renderFloristItemsHTML } from './floristPrint';

const dest = { forWhom: 'gift' as const, mode: 'delivery' as const, date: '2026-10-23', slot: '16:00–18:00', street: 'Rua A', number: '1', neighborhood: 'Centro', fee: 10 };

describe('floristPrint', () => {
  it('pronto até = data da entrega + primeira hora do turno', () => {
    expect(floristReadyLabel(dest)).toBe('23/10 16h');
  });
  it('taxa de entrega cobrada uma vez por destino', () => {
    const items = [{ name: 'A', quantity: 1, price: 50, destination: dest }, { name: 'B', quantity: 1, price: 30, destination: dest }];
    expect(floristItemFees(items)).toEqual([10, 0]);
  });
  it('separa produtos com linha tracejada', () => {
    const html = renderFloristItemsHTML([{ name: 'A', quantity: 1, price: 50, destination: dest }, { name: 'B', quantity: 1, price: 30, destination: dest }]);
    expect(html.match(/fl-sep/g)?.length).toBe(1);
    expect(html.indexOf('PRESENTE')).toBeLessThan(html.indexOf('[1x] A'));
  });
});
