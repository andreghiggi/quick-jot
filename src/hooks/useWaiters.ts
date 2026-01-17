import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Waiter {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
}

interface UseWaitersProps {
  companyId?: string;
}

export function useWaiters({ companyId }: UseWaitersProps) {
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchWaiters();
    }
  }, [companyId]);

  async function fetchWaiters() {
    if (!companyId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('waiters')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (error) throw error;
      
      // Fetch emails from profiles
      if (data && data.length > 0) {
        const userIds = data.map(w => w.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);
        
        const waitersWithEmail = data.map(waiter => ({
          ...waiter,
          email: profiles?.find(p => p.id === waiter.user_id)?.email
        }));
        
        setWaiters(waitersWithEmail);
      } else {
        setWaiters([]);
      }
    } catch (error) {
      console.error('Error fetching waiters:', error);
      toast.error('Erro ao carregar garçons');
    } finally {
      setLoading(false);
    }
  }

  async function createWaiter(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }): Promise<boolean> {
    if (!companyId) {
      toast.error('Empresa não selecionada');
      return false;
    }

    try {
      // Call edge function to create waiter without losing current session
      const { data: result, error } = await supabase.functions.invoke('create-waiter', {
        body: {
          email: data.email,
          password: data.password,
          name: data.name,
          phone: data.phone,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error(`Erro ao criar garçom: ${error.message}`);
        return false;
      }

      if (result?.error) {
        console.error('Waiter creation error:', result.error);
        if (result.error.includes('already')) {
          toast.error('Este email já está cadastrado no sistema');
        } else {
          toast.error(`Erro: ${result.error}`);
        }
        return false;
      }

      toast.success('Garçom cadastrado com sucesso!');
      fetchWaiters();
      return true;
    } catch (error: any) {
      console.error('Error creating waiter:', error);
      toast.error(`Erro inesperado: ${error.message}`);
      return false;
    }
  }

  async function updateWaiter(
    waiterId: string,
    data: { name?: string; phone?: string; active?: boolean }
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('waiters')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', waiterId);

      if (error) throw error;

      toast.success('Garçom atualizado!');
      fetchWaiters();
      return true;
    } catch (error) {
      console.error('Error updating waiter:', error);
      toast.error('Erro ao atualizar garçom');
      return false;
    }
  }

  async function deleteWaiter(waiterId: string, userId: string): Promise<boolean> {
    try {
      // Delete waiter record (user remains but loses waiter access)
      const { error } = await supabase
        .from('waiters')
        .delete()
        .eq('id', waiterId);

      if (error) throw error;

      // Remove from company_users
      await supabase
        .from('company_users')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyId);

      toast.success('Garçom removido!');
      fetchWaiters();
      return true;
    } catch (error) {
      console.error('Error deleting waiter:', error);
      toast.error('Erro ao remover garçom');
      return false;
    }
  }

  return {
    waiters,
    loading,
    createWaiter,
    updateWaiter,
    deleteWaiter,
    refetch: fetchWaiters,
  };
}
