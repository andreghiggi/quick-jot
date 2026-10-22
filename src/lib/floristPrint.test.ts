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
    expect(html.indexOf('<span class="name">A<')).toBeLessThan(html.indexOf('PRESENTE'));
  });
  it('pronto até sai dentro de cada produto e usa "Mensagem do cartão"', () => {
    const html = renderFloristItemsHTML([
      { name: 'A', quantity: 1, price: 50, destination: { ...dest, cardMessage: 'Oi' } },
      { name: 'B', quantity: 1, price: 30, destination: { ...dest, date: '2026-10-31', slot: '12:00–14:00' } },
    ]);
    expect(html).toContain('PRONTO ATÉ: 23/10 16h');
    expect(html).toContain('PRONTO ATÉ: 31/10 12h');
    expect(html).toContain('MENSAGEM DO CARTÃO:');
    expect(html).not.toContain('escrever à mão');
  });
});
