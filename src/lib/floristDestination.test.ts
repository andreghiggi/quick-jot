import { describe, it, expect } from 'vitest';
import { validateDestination, totalDeliveryFee, type FloristDestination } from './floristDestination';

const today = '2026-10-12';
const addr = { street: 'Rua A', number: '10', neighborhood: 'Centro', reference: 'Praça' };

describe('floristDestination', () => {
  it('presente com retirada exige só a mensagem do cartão', () => {
    expect(validateDestination({ forWhom: 'gift', mode: 'pickup' }, today)).toContain('Escreva a mensagem do cartão');
    expect(validateDestination({ forWhom: 'gift', mode: 'pickup', cardMessage: 'Te amo' }, today)).toEqual([]);
  });

  it('para mim mesmo com retirada libera direto', () => {
    expect(validateDestination({ forWhom: 'self', mode: 'pickup' }, today)).toEqual([]);
  });

  it('presente com entrega exige destinatário, WhatsApp, endereço, data e turno', () => {
    const e = validateDestination({ forWhom: 'gift', mode: 'delivery', cardMessage: 'Oi' }, today);
    expect(e).toEqual(expect.arrayContaining([
      'Escolha a data da entrega', 'Escolha o turno da entrega', 'Informe o nome de quem recebe',
      'Informe o WhatsApp de quem recebe', 'Informe a rua', 'Informe o número', 'Informe o bairro', 'Informe o ponto de referência',
    ]));
  });

  it('complemento não é obrigatório', () => {
    expect(validateDestination({ forWhom: 'self', mode: 'delivery', date: today, slot: '08:00 - 10:00', ...addr }, today)).toEqual([]);
  });

  it('cobra uma taxa por endereço de entrega distinto', () => {
    const d = (street: string): FloristDestination => ({ forWhom: 'self', mode: 'delivery', date: today, slot: 'x', ...addr, street, fee: 8 });
    expect(totalDeliveryFee([d('Rua A'), d('Rua B'), d('Rua C')])).toBe(24);
    expect(totalDeliveryFee([d('Rua A'), d('Rua A'), d('Rua C')])).toBe(16);
    expect(totalDeliveryFee([{ forWhom: 'self', mode: 'pickup' }])).toBe(0);
  });
});
