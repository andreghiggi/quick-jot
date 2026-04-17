import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PaymentChannel = 'pdv' | 'express' | 'menu';

export interface PaymentMethod {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
  display_order: number;
  pix_key: string | null;
  integration_type: string | null;
  channel: PaymentChannel;
  created_at: string;
  updated_at: string;
}

interface UsePaymentMethodsOptions {
  companyId?: string;
  /** Filtra a lista por canal. Se omitido, retorna todos. */
  channel?: PaymentChannel;
}

export function usePaymentMethods(options: UsePaymentMethodsOptions = {}) {
  const { companyId, channel } = options;
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchPaymentMethods();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, channel]);

  async function fetchPaymentMethods() {
    if (!companyId) return;

    try {
      let query = supabase
        .from('payment_methods')
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true });

      if (channel) {
        query = query.eq('channel', channel);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPaymentMethods((data as PaymentMethod[]) || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addPaymentMethod(
    name: string,
    pixKey?: string,
    integrationType?: string,
    channelOverride?: PaymentChannel
  ): Promise<boolean> {
    if (!companyId) return false;

    try {
      const maxOrder = paymentMethods.reduce((max, m) => Math.max(max, m.display_order), 0);
      const targetChannel = channelOverride ?? channel ?? 'menu';

      const insertData: any = {
        company_id: companyId,
        name,
        display_order: maxOrder + 1,
        channel: targetChannel,
      };
      if (pixKey) insertData.pix_key = pixKey;
      if (integrationType) insertData.integration_type = integrationType;

      const { error } = await supabase
        .from('payment_methods')
        .insert(insertData);

      if (error) throw error;

      await fetchPaymentMethods();
      toast.success('Forma de pagamento adicionada!');
      return true;
    } catch (error) {
      console.error('Error adding payment method:', error);
      toast.error('Erro ao adicionar forma de pagamento');
      return false;
    }
  }

  async function updatePaymentMethod(id: string, data: Partial<PaymentMethod>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      await fetchPaymentMethods();
      toast.success('Forma de pagamento atualizada!');
      return true;
    } catch (error) {
      console.error('Error updating payment method:', error);
      toast.error('Erro ao atualizar forma de pagamento');
      return false;
    }
  }

  async function deletePaymentMethod(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchPaymentMethods();
      toast.success('Forma de pagamento removida!');
      return true;
    } catch (error) {
      console.error('Error deleting payment method:', error);
      toast.error('Erro ao remover forma de pagamento');
      return false;
    }
  }

  const activePaymentMethods = paymentMethods.filter(m => m.active);

  return {
    paymentMethods,
    activePaymentMethods,
    loading,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    refetch: fetchPaymentMethods
  };
}
