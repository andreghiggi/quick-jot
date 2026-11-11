import { describe, it, expect } from 'vitest';
import { appendPayment, buildInstallments, syncSinglePayment, selectPaymentType, paymentDifferenceCents, validAccessKey, validTaxDocument } from './nfeForm';

describe('nfeForm', () => {
  it('pagamentos precisam fechar o total exato', () => {
    expect(paymentDifferenceCents(100.1, [{ tipo: '17', valor: 50.05 }, { tipo: '03', valor: 50.05 }])).toBe(0);
    expect(paymentDifferenceCents(100, [{ tipo: '01', valor: 60 }])).toBe(4000);
  });
  it('modelo 55 não desconta troco de pagamento excedente', () => {
    expect(paymentDifferenceCents(90, [{ tipo: '01', valor: 100 }])).toBe(-1000);
  });
  it('sem pagamento (90) dispensa soma', () => {
    expect(paymentDifferenceCents(90, [{ tipo: '90', valor: 0 }])).toBe(0);
  });
  it('forma única acompanha total dos itens automaticamente', () => {
    expect(syncSinglePayment(2828.5, [{ tipo: '17', valor: 0 }])).toEqual([{ tipo: '17', valor: 2828.5 }]);
    expect(syncSinglePayment(45, [{ tipo: '01', valor: 15 }])).toEqual([{ tipo: '01', valor: 45 }]);
  });
  it('selecionar outra forma preserva total automático', () => {
    expect(selectPaymentType(2828.5, [{ tipo: '17', valor: 0 }], 0, '15')).toEqual([{ tipo: '15', valor: 2828.5 }]);
  });
  it('segunda forma recebe saldo restante exato', () => {
    expect(appendPayment(100.1, [{ tipo: '01', valor: 60 }])).toEqual([{ tipo: '01', valor: 60 }, { tipo: '01', valor: 40.1 }]);
  });
  it('alterar total não sobrescreve uma divisão manual', () => {
    const split = [{ tipo: '01', valor: 10 }, { tipo: '17', valor: 5 }];
    expect(syncSinglePayment(20, split)).toEqual(split);
  });
  it('sem pagamento fica isolado e com valor zero', () => {
    expect(selectPaymentType(15, [{ tipo: '17', valor: 15 }], 0, '90')).toEqual([{ tipo: '90', valor: 0 }]);
    expect(syncSinglePayment(15, [{ tipo: '90', valor: 10 }])).toEqual([{ tipo: '90', valor: 0 }]);
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
