import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from, rows, writes } = vi.hoisted(() => ({ from: vi.fn(), rows: { value: [] as Record<string, unknown>[] }, writes: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { customerPhoneKey, validCustomerPhone, sameAddress, parseCustomerAddress, saveCustomerAddress } from './customerAddress';

const address = { label: 'Casa', address: 'Rua A', number: '10', complement: '', neighborhood: 'Centro', reference: 'Praça', city: 'Porto Alegre', state: 'RS' };
beforeEach(() => {
  rows.value = []; writes.length = 0;
  from.mockImplementation(() => {
    let payload: Record<string, unknown> | undefined;
    const filters: Record<string, unknown> = {};
    const chain: Record<string, any> = {};
    chain.select = () => chain;
    chain.eq = (key: string, value: unknown) => { filters[key] = value; return chain; };
    chain.neq = () => chain;
    chain.update = (input: Record<string, unknown>) => { payload = input; writes.push({ kind: 'update', input, filters }); return chain; };
    chain.insert = (input: Record<string, unknown>) => { payload = input; writes.push({ kind: 'insert', input, filters }); return chain; };
    chain.single = async () => ({ data: { id: 'saved', ...payload }, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows.value, error: null }).then(resolve);
    return chain;
  });
});
describe('Customer identity and address rules', () => {
  it('formatting does not change identity but another number does', () => {
    expect(customerPhoneKey('(51) 99999-1234')).toBe('51999991234');
    expect(customerPhoneKey('51999991234')).not.toBe(customerPhoneKey('51999995678'));
  });
  it('only searches complete 10 or 11 digit phones', () => {
    expect(validCustomerPhone('5199991234')).toBe(true);
    expect(validCustomerPhone('51999991234')).toBe(true);
    expect(validCustomerPhone('51999')).toBe(false);
    expect(validCustomerPhone('5551999991234')).toBe(false);
  });
  it('deduplicates formatting and accents, not distinct apartments', () => {
    expect(sameAddress(address, { ...address, address: '  RUA   A ', neighborhood: 'céntro', label: 'Trabalho', reference: 'Portão' })).toBe(true);
    expect(sameAddress(address, { ...address, complement: 'Apto 2' })).toBe(false);
  });
  it('parses legacy street, number, complement, neighborhood and reference', () => {
    expect(parseCustomerAddress('Rua A, 10 - Apto 2 - Centro | Ref: Praça')).toMatchObject({ address: 'Rua A', number: '10', complement: 'Apto 2', neighborhood: 'Centro', reference: 'Praça' });
  });
  it('reuses matching saved address instead of inserting a duplicate', async () => {
    rows.value = [{ id: 'existing', ...address, is_default: false }];
    await saveCustomerAddress('customer-b', 'company-a', { ...address, label: 'Trabalho' });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: 'update', filters: { id: 'existing', customer_id: 'customer-b', company_id: 'company-a' } });
  });
  it('never updates another customer selected ID', async () => {
    await saveCustomerAddress('customer-b', 'company-a', address, 'other-customer-id');
    expect(writes[0]).toMatchObject({ kind: 'insert', input: { customer_id: 'customer-b', company_id: 'company-a', is_default: true } });
  });
  it('keeps an existing default when adding a second address', async () => {
    rows.value = [{ id: 'existing', ...address, is_default: true }];
    await saveCustomerAddress('customer-b', 'company-a', { ...address, number: '20' });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: 'insert', input: { number: '20', is_default: false } });
  });
});