import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!customerId) {
      setAddresses([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setAddresses((data ?? []) as CustomerAddress[]);
    } catch (err) {
      console.error('useCustomerAddresses.refetch', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: NewAddressInput): Promise<CustomerAddress | null> => {
      if (!customerId || !companyId) return null;
      try {
        // Se este vier como padrão, desmarca os outros antes
        if (input.is_default) {
          await supabase
            .from('customer_addresses')
            .update({ is_default: false })
            .eq('customer_id', customerId);
        }
        const { data, error } = await supabase
          .from('customer_addresses')
          .insert({
            customer_id: customerId,
            company_id: companyId,
            label: input.label ?? null,
            address: input.address ?? null,
            number: input.number ?? null,
            complement: input.complement ?? null,
            neighborhood: input.neighborhood ?? null,
            reference: input.reference ?? null,
            city: input.city ?? null,
            state: input.state ?? null,
            is_default: input.is_default ?? false,
          })
          .select('*')
          .single();
        if (error) throw error;
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
      if (!customerId) return;
      try {
        await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', customerId);
        await supabase
          .from('customer_addresses')
          .update({ is_default: true })
          .eq('id', id);
        await refetch();
      } catch (err) {
        console.error('useCustomerAddresses.setDefault', err);
      }
    },
    [customerId, refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('customer_addresses')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await refetch();
      } catch (err) {
        console.error('useCustomerAddresses.remove', err);
      }
    },
    [refetch],
  );

  return { addresses, loading, refetch, create, setDefault, remove };
}