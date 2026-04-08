import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, AppRole, Company, UserProfile } from '@/hooks/useAuth';
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
  signUp: (email: string, password: string, fullName: string, companyName?: string, addressData?: { street: string; number: string; complement?: string; neighborhood: string; reference?: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isSuperAdmin: () => boolean;
  isCompanyAdmin: () => boolean;
  isWaiter: () => boolean;
  refetchUserData: () => void;
  // Impersonation
  isImpersonating: boolean;
  impersonatedCompany: Company | null;
  impersonateCompany: (companyId: string) => Promise<boolean>;
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
