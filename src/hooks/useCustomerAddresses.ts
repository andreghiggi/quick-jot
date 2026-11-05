import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { saveCustomerAddress } from '@/lib/customerAddress';

export interface CustomerAddress {
  id: string;
  customer_id: string;
  company_id: string;
  label: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  reference: string | null;
  city: string | null;
  state: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type NewAddressInput = Omit<
  CustomerAddress,
  'id' | 'created_at' | 'updated_at' | 'customer_id' | 'company_id' | 'is_default'
> & { is_default?: boolean };

/**
 * Lista e gerencia endereços de um cliente (cardápio público).
 * Aditivo — não interfere no fluxo atual de `customers.address`.
 */
export function useCustomerAddresses(customerId: string | null, companyId: string | null) {
  const [result, setResult] = useState<{ key: string; addresses: CustomerAddress[] }>({ key: '', addresses: [] });
  const key = `${companyId ?? ''}:${customerId ?? ''}`;
  const activeKey = useRef(key);
  activeKey.current = key;
  const request = useRef(0);
  const addresses = result.key === key ? result.addresses : [];
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    const version = ++request.current;
    if (!customerId || !companyId) {
      setResult({ key, addresses: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .eq('company_id', companyId)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      if (activeKey.current === key && version === request.current) setResult({ key, addresses: (data ?? []) as CustomerAddress[] });
    } catch (err) {
      console.error('useCustomerAddresses.refetch', err);
    } finally {
      if (activeKey.current === key && version === request.current) setLoading(false);
    }
  }, [customerId, companyId, key]);

  useEffect(() => {
    void refetch();
    return () => { request.current++; };
  }, [refetch]);

  const create = useCallback(
    async (input: NewAddressInput): Promise<CustomerAddress | null> => {
      if (!customerId || !companyId) return null;
      try {
        const data = await saveCustomerAddress(customerId, companyId, input);
        await refetch();
        return data as CustomerAddress;
      } catch (err) {
        console.error('useCustomerAddresses.create', err);
        return null;
      }
    },
    [customerId, companyId, refetch],
  );

  const setDefault = useCallback(
    async (id: string) => {
      if (!customerId || !companyId) return;
      const { error } = await supabase.from('customer_addresses').update({ is_default: true })
        .eq('id', id).eq('customer_id', customerId).eq('company_id', companyId);
      if (error) throw error;
      const { error: clearError } = await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', customerId).eq('company_id', companyId).neq('id', id);
      if (clearError) throw clearError;
      await refetch();
    },
    [customerId, companyId, refetch],
  );

  const update = useCallback(async (id: string, input: NewAddressInput) => {
    if (!customerId || !companyId) return;
    const saved = await saveCustomerAddress(customerId, companyId, input, id);
    await refetch();
    return saved;
  }, [customerId, companyId, refetch]);

  const remove = useCallback(
    async (id: string) => {
      if (!customerId || !companyId) return;
        const { error } = await supabase
          .from('customer_addresses')
          .delete()
          .eq('id', id).eq('customer_id', customerId).eq('company_id', companyId);
        if (error) throw error;
        await refetch();
    },
    [customerId, companyId, refetch],
  );

  return { addresses, loading, refetch, create, update, setDefault, remove };
}