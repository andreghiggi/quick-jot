import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PaymentMethod {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
  display_order: number;
  pix_key: string | null;
  created_at: string;
  updated_at: string;
}

interface UsePaymentMethodsOptions {
  companyId?: string;
}

export function usePaymentMethods(options: UsePaymentMethodsOptions = {}) {
  const { companyId } = options;
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchPaymentMethods();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  async function fetchPaymentMethods() {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addPaymentMethod(name: string): Promise<boolean> {
    if (!companyId) return false;

    try {
      const maxOrder = paymentMethods.reduce((max, m) => Math.max(max, m.display_order), 0);
      
      const { error } = await supabase
        .from('payment_methods')
        .insert({
          company_id: companyId,
          name,
          display_order: maxOrder + 1
        });

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
