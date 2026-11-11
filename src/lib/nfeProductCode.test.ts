import { describe, expect, it } from 'vitest';
import { nfeProductCode, withNfeProductCode } from '../../supabase/functions/_shared/nfe-product-code';

describe('NF-e registered product code', () => {
  it('prefers the registered code over GTIN and product id', () => {
    expect(nfeProductCode({ code: '00042', gtin: '7891234567895', id: 'abc123' })).toBe('00042');
  });
  it('uses GTIN when the registered code is blank', () => {
    expect(nfeProductCode({ code: '  ', gtin: '7891234567895', id: 'abc123' })).toBe('7891234567895');
  });
  it('uses the registered id for a product without code or GTIN', () => {
    expect(nfeProductCode({ code: null, gtin: null, id: '46d6ff86-1111-4444-8888-123456789abc' })).toBe('46d6ff86-1111-4444-8888-123456789abc');
  });
  it('recovers a legacy draft using its persisted product_id', () => {
    expect(withNfeProductCode({ code: '', product_id: 'abc123', descricao: 'Água' })).toEqual({
      code: 'abc123', codigo: 'abc123', cProd: 'abc123', product_id: 'abc123', descricao: 'Água',
    });
  });
  it('does not use SEM GTIN as a product code', () => {
    expect(nfeProductCode({ gtin: 'SEM GTIN', product_id: 'abc123' })).toBe('abc123');
  });
  it('preserves explicit Fiscal Flow codes when normalizing again', () => {
    const item = withNfeProductCode({ codigo: '00007', code: 'older', product_id: 'abc123', ncm: '22011000', valor_unitario: 5 });
    expect(item).toEqual({ codigo: '00007', code: '00007', cProd: '00007', product_id: 'abc123', ncm: '22011000', valor_unitario: 5 });
    expect(withNfeProductCode(item)).toEqual(item);
  });
  it('never invents a code for an item without a registered identity', () => {
    expect(nfeProductCode({})).toBe('');
  });
});