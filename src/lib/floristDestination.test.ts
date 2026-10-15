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

import { renderFloristBlockHTML } from '@/utils/printProductionTicket';
describe('layout floricultura', () => {
  it('imprime entrega, quem recebe, endereço e cartão', () => {
    const html = renderFloristBlockHTML({ index: 1, total: 2, destination: {
      forWhom: 'gift', mode: 'delivery', date: '2026-10-14', slot: '10:00–12:00',
      recipientName: 'Maria', recipientPhone: '51999887766', street: 'Rua A', number: '10',
      neighborhood: 'Centro', reference: 'Praça', cardMessage: 'Te amo' } });
    expect(html).toContain('DESTINO 1 DE 2');
    expect(html).toContain('14/10/2026');
    expect(html).toContain('RECEBE: Maria');
    expect(html).toContain('[ENDERECO]Rua A, 10 - Centro[/ENDERECO]');
    expect(html).toContain('Te amo');
  });
  it('retirada para o comprador não imprime endereço nem cartão', () => {
    const html = renderFloristBlockHTML({ index: 1, total: 1, destination: { forWhom: 'self', mode: 'pickup' } });
    expect(html).not.toContain('[ENDERECO]');
    expect(html).not.toContain('CARTAO');
  });
});

import { parseDestinationFromNotes as _parse } from './floristDestination';
describe('parseDestinationFromNotes (reimpressão floricultura)', () => {
  it('reconstrói o destino gravado no pedido', () => {
    const n = 'Sem laço | DESTINO 1: PRESENTE | Entrega 22/10/2026 16:00–18:00 | Recebe: Débora Boscato (54999660158) | Endereço: Marechal Floriano, 859 - Centro | Ref: Casa salmão | Cartão: "Te amo | minha vida!" | [DESC]x[/DESC]';
    const { destination: d, rest } = _parse(n);
    expect(rest).toBe('Sem laço');
    expect(d?.forWhom).toBe('gift');
    expect(d?.mode).toBe('delivery');
    expect(d?.date).toBe('2026-10-22');
    expect(d?.slot).toBe('16:00–18:00');
    expect(d?.recipientName).toBe('Débora Boscato');
    expect(d?.recipientPhone).toBe('54999660158');
    expect(d?.street).toBe('Marechal Floriano');
    expect(d?.number).toBe('859');
    expect(d?.neighborhood).toBe('Centro');
    expect(d?.reference).toBe('Casa salmão');
    expect(d?.cardMessage).toBe('Te amo | minha vida!');
  });
  it('sem destino devolve só a observação', () => {
    expect(_parse('Sem cebola').destination).toBeNull();
  });
});
