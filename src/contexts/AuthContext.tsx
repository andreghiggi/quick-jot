import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, AppRole, Company, UserProfile, ImpersonatedReseller } from '@/hooks/useAuth';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  roles: AppRole[];
  company: Company | null;
  realCompany: Company | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, companyName?: string, addressData?: { street: string; number: string; complement?: string; neighborhood: string; reference?: string; cnpj?: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isSuperAdmin: () => boolean;
  isCompanyAdmin: () => boolean;
  isWaiter: () => boolean;
  isReseller: () => boolean;
  refetchUserData: () => void;
  // Impersonation
  isImpersonating: boolean;
  impersonatedCompany: Company | null;
  impersonatedReseller: ImpersonatedReseller | null;
  impersonateCompany: (companyId: string) => Promise<boolean>;
  impersonateReseller: (resellerId: string) => Promise<boolean>;
  exitImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
