import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCompanies() {
  const { isSuperAdmin } = useAuthContext();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchCompanies() {
    if (!isSuperAdmin()) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function createCompany(data: {
    name: string;
    slug: string;
    phone?: string;
    address?: string;
  }): Promise<string | null> {
    try {
      const { data: newCompany, error } = await supabase
        .from('companies')
        .insert({
          name: data.name,
          slug: data.slug,
          phone: data.phone || null,
          address: data.address || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Empresa criada com sucesso!');
      fetchCompanies();
      return newCompany?.id || null;
    } catch (error: any) {
      console.error('Error creating company:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma empresa com esse slug');
      } else {
        toast.error('Erro ao criar empresa');
      }
      return null;
    }
  }

  async function updateCompany(id: string, data: Partial<Company>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('companies')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      toast.success('Empresa atualizada!');
      fetchCompanies();
      return true;
    } catch (error) {
      console.error('Error updating company:', error);
      toast.error('Erro ao atualizar empresa');
      return false;
    }
  }

  async function deleteCompany(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Empresa removida!');
      fetchCompanies();
      return true;
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Erro ao remover empresa');
      return false;
    }
  }

  async function addUserToCompany(companyId: string, userId: string, isOwner: boolean = false): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('company_users')
        .insert({
          company_id: companyId,
          user_id: userId,
          is_owner: isOwner,
        });

      if (error) throw error;

      toast.success('Usuário adicionado à empresa!');
      return true;
    } catch (error: any) {
      console.error('Error adding user to company:', error);
      if (error.code === '23505') {
        toast.error('Usuário já pertence a esta empresa');
      } else {
        toast.error('Erro ao adicionar usuário');
      }
      return false;
    }
  }

  async function setUserRole(userId: string, role: 'super_admin' | 'company_admin' | 'company_user'): Promise<boolean> {
    try {
      // Remove existing roles first
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Add new role
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
        });

      if (error) throw error;

      toast.success('Permissão atualizada!');
      return true;
    } catch (error) {
      console.error('Error setting user role:', error);
      toast.error('Erro ao atualizar permissão');
      return false;
    }
  }

  return {
    companies,
    loading,
    createCompany,
    updateCompany,
    deleteCompany,
    addUserToCompany,
    setUserRole,
    refetch: fetchCompanies,
  };
}
