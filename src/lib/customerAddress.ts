import { supabase } from '@/integrations/supabase/client';
import type { CustomerAddress, NewAddressInput } from '@/hooks/useCustomerAddresses';

const norm = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const customerPhoneKey = (phone: string) => phone.replace(/\D/g, '');
export const validCustomerPhone = (phone: string) => /^\d{10,11}$/.test(customerPhoneKey(phone));
export function sameAddress(a: NewAddressInput, b: NewAddressInput): boolean {
  return (['address', 'number', 'complement', 'neighborhood', 'city', 'state'] as const).every(key => norm(a[key]) === norm(b[key]));
}
export function parseCustomerAddress(address: string | null | undefined): NewAddressInput {
  const [main = '', reference = ''] = (address ?? '').split(/\s*\|\s*Ref:\s*/i);
  const parts = main.split(/\s+-\s+/);
  const street = parts.shift() ?? '';
  const comma = street.lastIndexOf(',');
  return { label: null, address: comma >= 0 ? street.slice(0, comma).trim() : street.trim(), number: comma >= 0 ? street.slice(comma + 1).trim() : '', complement: parts.length > 1 ? parts.slice(0, -1).join(' - ') : '', neighborhood: parts.at(-1) ?? '', reference: reference.trim(), city: null, state: null };
}

// Both checkouts share deduplication and tenant/customer-scoped writes.
export async function saveCustomerAddress(customerId: string, companyId: string, input: NewAddressInput, selectedId?: string | null): Promise<CustomerAddress> {
  const { data, error } = await supabase.from('customer_addresses').select('*').eq('customer_id', customerId).eq('company_id', companyId);
  if (error) throw error;
  const addresses = (data ?? []) as CustomerAddress[];
  const existing = addresses.find(a => a.id === selectedId) ?? addresses.find(a => sameAddress(a, input));
  const isDefault = input.is_default ?? existing?.is_default ?? addresses.length === 0;
  const payload = { ...input, is_default: isDefault };
  const query = existing
    ? supabase.from('customer_addresses').update(payload).eq('id', existing.id).eq('customer_id', customerId).eq('company_id', companyId)
    : supabase.from('customer_addresses').insert({ ...payload, customer_id: customerId, company_id: companyId });
  const { data: saved, error: saveError } = await query.select('*').single();
  if (saveError) throw saveError;
  if (isDefault) {
    const { error: defaultError } = await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', customerId).eq('company_id', companyId).neq('id', saved.id);
    if (defaultError) throw defaultError;
  }
  return saved as CustomerAddress;
}