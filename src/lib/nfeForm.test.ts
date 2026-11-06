import { describe, it, expect } from 'vitest';
import { buildInstallments, changeAllowed, paymentDifferenceCents, validAccessKey, validTaxDocument } from './nfeForm';

describe('nfeForm', () => {
  it('pagamentos precisam fechar o total exato', () => {
    expect(paymentDifferenceCents(100.1, [{ tipo: '17', valor: 50.05 }, { tipo: '03', valor: 50.05 }])).toBe(0);
    expect(paymentDifferenceCents(100, [{ tipo: '01', valor: 60 }])).toBe(4000);
  });
  it('troco desconta do valor recebido', () => {
    expect(paymentDifferenceCents(90, [{ tipo: '01', valor: 100 }], 10)).toBe(0);
  });
  it('sem pagamento (90) dispensa soma', () => {
    expect(paymentDifferenceCents(90, [{ tipo: '90', valor: 0 }])).toBe(0);
  });
  it('troco só com dinheiro', () => {
    expect(changeAllowed([{ tipo: '17', valor: 1 }])).toBe(false);
    expect(changeAllowed([{ tipo: '01', valor: 1 }])).toBe(true);
  });
  it('parcelas 30/60/90 fecham o total com resto na última', () => {
    const p = buildInstallments(100, '30/60/90', new Date(2026, 0, 1));
    expect(p.map(x => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p[0].vencimento).toBe('2026-01-31');
    expect(p[2].numero).toBe('003');
  });
  it('chave de acesso exige 44 dígitos', () => {
    expect(validAccessKey('1'.repeat(44))).toBe(true);
    expect(validAccessKey('1'.repeat(43))).toBe(false);
  });
  it('documento aceita CPF ou CNPJ', () => {
    expect(validTaxDocument('123.456.789-01')).toBe(true);
    expect(validTaxDocument('123')).toBe(false);
  });
});
