import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AppRole = 'super_admin' | 'reseller' | 'company_admin' | 'company_user' | 'waiter';

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

const IMPERSONATED_COMPANY_KEY = 'impersonated_company';
const IMPERSONATED_RESELLER_KEY = 'impersonated_reseller';

export interface ImpersonatedReseller {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<Company | null>(null);
  const [impersonatedReseller, setImpersonatedReseller] = useState<ImpersonatedReseller | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore impersonation state from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(IMPERSONATED_COMPANY_KEY);
    if (stored) {
      try {
        setImpersonatedCompany(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem(IMPERSONATED_COMPANY_KEY);
      }
    }
    const storedReseller = sessionStorage.getItem(IMPERSONATED_RESELLER_KEY);
    if (storedReseller) {
      try {
        setImpersonatedReseller(JSON.parse(storedReseller));
      } catch {
        sessionStorage.removeItem(IMPERSONATED_RESELLER_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setCompany(null);
          setImpersonatedCompany(null);
          setImpersonatedReseller(null);
          sessionStorage.removeItem(IMPERSONATED_COMPANY_KEY);
          sessionStorage.removeItem(IMPERSONATED_RESELLER_KEY);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserData(userId: string) {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesData) {
        setRoles(rolesData.map(r => r.role as AppRole));
      }

      // Fetch company
      const { data: companyUserData } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', userId)
        .single();

      if (companyUserData) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyUserData.company_id)
          .single();

        if (companyData) {
          setCompany(companyData);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return { error };
    }
    
    return { error: null };
  }

  async function signUp(email: string, password: string, fullName: string, companyName?: string, addressData?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    reference?: string;
    cnpj?: string;
  }) {
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          company_name: companyName || null,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return { error };
    }

    // If address data was provided, update the company after creation
    if (addressData && signUpData.user) {
      // Wait a moment for the trigger to create the company
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const fullAddress = [
        addressData.street,
        addressData.number,
        addressData.complement,
        addressData.neighborhood,
        addressData.reference ? `Ref: ${addressData.reference}` : '',
      ].filter(Boolean).join(', ');

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', signUpData.user.id)
        .single();

      if (companyUser) {
        await supabase
          .from('companies')
          .update({
            address: fullAddress,
            address_street: addressData.street,
            address_number: addressData.number,
            address_complement: addressData.complement || null,
            address_neighborhood: addressData.neighborhood,
            address_reference: addressData.reference || null,
            cnpj: addressData.cnpj || null,
          } as any)
          .eq('id', companyUser.company_id);
      }
    }

    toast.success('Conta criada com sucesso!');
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setCompany(null);
    setImpersonatedCompany(null);
    setImpersonatedReseller(null);
    sessionStorage.removeItem(IMPERSONATED_COMPANY_KEY);
    sessionStorage.removeItem(IMPERSONATED_RESELLER_KEY);
  }

  function hasRole(role: AppRole): boolean {
    return roles.includes(role);
  }

  function isSuperAdmin(): boolean {
    return hasRole('super_admin');
  }

  function isCompanyAdmin(): boolean {
    return hasRole('company_admin') || hasRole('super_admin');
  }

  function isWaiter(): boolean {
    return hasRole('waiter');
  }

  function isReseller(): boolean {
    return hasRole('reseller');
  }

  // Impersonation functions for super admin
  const impersonateCompany = useCallback(async (companyId: string) => {
    if (!hasRole('super_admin')) {
      toast.error('Permissão negada');
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) throw error;

      setImpersonatedCompany(data);
      sessionStorage.setItem(IMPERSONATED_COMPANY_KEY, JSON.stringify(data));
      toast.success(`Acessando como: ${data.name}`);
      return true;
    } catch (error) {
      console.error('Error impersonating company:', error);
      toast.error('Erro ao acessar empresa');
      return false;
    }
  }, [roles]);

  const exitImpersonation = useCallback(() => {
    setImpersonatedCompany(null);
    setImpersonatedReseller(null);
    sessionStorage.removeItem(IMPERSONATED_COMPANY_KEY);
    sessionStorage.removeItem(IMPERSONATED_RESELLER_KEY);
    toast.info('Modo de suporte encerrado');
  }, []);

  // Impersonate a reseller (super_admin only)
  const impersonateReseller = useCallback(async (resellerId: string) => {
    if (!hasRole('super_admin')) {
      toast.error('Permissão negada');
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('resellers')
        .select('id, name, email, user_id')
        .eq('id', resellerId)
        .single();
      if (error) throw error;
      const payload: ImpersonatedReseller = {
        id: data.id,
        name: data.name,
        email: data.email,
        user_id: data.user_id,
      };
      setImpersonatedReseller(payload);
      sessionStorage.setItem(IMPERSONATED_RESELLER_KEY, JSON.stringify(payload));
      toast.success(`Acessando painel de: ${data.name}`);
      return true;
    } catch (err) {
      console.error('Error impersonating reseller:', err);
      toast.error('Erro ao acessar revendedor');
      return false;
    }
  }, [roles]);

  // The effective company is the impersonated one if super admin is impersonating
  const effectiveCompany = impersonatedCompany || company;
  const isImpersonating = !!impersonatedCompany || !!impersonatedReseller;

  // Effective roles: when impersonating a reseller, super_admin gains 'reseller' role virtually
  const effectiveRoles: AppRole[] = impersonatedReseller
    ? Array.from(new Set([...roles, 'reseller' as AppRole]))
    : roles;

  function hasEffectiveRole(role: AppRole): boolean {
    return effectiveRoles.includes(role);
  }

  return {
    user,
    session,
    profile,
    roles: effectiveRoles,
    company: effectiveCompany,
    realCompany: company,
    loading,
    signIn,
    signUp,
    signOut,
    hasRole: hasEffectiveRole,
    isSuperAdmin,
    isCompanyAdmin,
    isWaiter,
    isReseller: () => hasEffectiveRole('reseller'),
    refetchUserData: () => user && fetchUserData(user.id),
    // Impersonation
    isImpersonating,
    impersonatedCompany,
    impersonatedReseller,
    impersonateCompany,
    impersonateReseller,
    exitImpersonation,
  };
}
