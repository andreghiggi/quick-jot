import { describe, it, expect } from 'vitest';
import { validateIndIE, formatCpfCnpj } from './fiscalPerson';

describe('fiscalPerson', () => {
  it('contribuinte ICMS exige IE', () => {
    expect(validateIndIE('1', '')).not.toBeNull();
    expect(validateIndIE('1', '123')).toBeNull();
  });
  it('não contribuinte e isento não exigem IE', () => {
    expect(validateIndIE('9', '')).toBeNull();
    expect(validateIndIE('2', '')).toBeNull();
  });
  it('formata CPF e CNPJ', () => {
    expect(formatCpfCnpj('12345678901')).toBe('123.456.789-01');
    expect(formatCpfCnpj('12345678000195')).toBe('12.345.678/0001-95');
  });
});
