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
      // 1. Create auth user using admin function via edge function or signUp
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

      if (authError) {
        console.error('Auth error:', authError);
        if (authError.message?.includes('already registered')) {
          toast.error('Este email já está cadastrado no sistema');
        } else {
          toast.error(`Erro ao criar usuário: ${authError.message}`);
        }
        return false;
      }
      
      if (!authData.user) {
        toast.error('Usuário não foi criado');
        return false;
      }

      const userId = authData.user.id;
      console.log('User created with ID:', userId);

      // 2. Add waiter role (need to delete default role first)
      const { error: deleteRoleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      
      if (deleteRoleError) {
        console.error('Error deleting default role:', deleteRoleError);
      }

      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'waiter' as any,
        });

      if (roleError) {
        console.error('Error adding waiter role:', roleError);
        toast.error(`Erro ao definir função: ${roleError.message}`);
        return false;
      }

      // 3. Add to company_users
      const { error: companyUserError } = await supabase
        .from('company_users')
        .insert({
          company_id: companyId,
          user_id: userId,
          is_owner: false,
        });

      if (companyUserError) {
        console.error('Error adding to company_users:', companyUserError);
        toast.error(`Erro ao vincular à empresa: ${companyUserError.message}`);
        return false;
      }

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

      if (waiterError) {
        console.error('Error creating waiter record:', waiterError);
        toast.error(`Erro ao criar registro do garçom: ${waiterError.message}`);
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
