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
    if (!companyId) return false;

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: data.name,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Usuário não criado');

      const userId = authData.user.id;

      // 2. Add waiter role (need to delete default role first)
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'waiter' as any,
        });

      if (roleError) throw roleError;

      // 3. Add to company_users
      const { error: companyUserError } = await supabase
        .from('company_users')
        .insert({
          company_id: companyId,
          user_id: userId,
          is_owner: false,
        });

      if (companyUserError) throw companyUserError;

      // 4. Create waiter record
      const { error: waiterError } = await supabase
        .from('waiters')
        .insert({
          user_id: userId,
          company_id: companyId,
          name: data.name,
          phone: data.phone || null,
          active: true,
        });

      if (waiterError) throw waiterError;

      toast.success('Garçom cadastrado com sucesso!');
      fetchWaiters();
      return true;
    } catch (error: any) {
      console.error('Error creating waiter:', error);
      if (error.message?.includes('already registered')) {
        toast.error('Este email já está cadastrado');
      } else {
        toast.error('Erro ao cadastrar garçom');
      }
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
