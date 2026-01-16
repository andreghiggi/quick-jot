import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AppRole = 'super_admin' | 'company_admin' | 'company_user' | 'waiter';

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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function signUp(email: string, password: string, fullName: string) {
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return { error };
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

  return {
    user,
    session,
    profile,
    roles,
    company,
    loading,
    signIn,
    signUp,
    signOut,
    hasRole,
    isSuperAdmin,
    isCompanyAdmin,
    isWaiter,
    refetchUserData: () => user && fetchUserData(user.id),
  };
}
