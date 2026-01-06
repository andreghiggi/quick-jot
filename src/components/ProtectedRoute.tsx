import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: AppRole;
  requireCompany?: boolean;
}

export function ProtectedRoute({ children, requiredRole, requireCompany = false }: ProtectedRouteProps) {
  const { user, loading, hasRole, company } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredRole && !hasRole(requiredRole) && !hasRole('super_admin')) {
    return <Navigate to="/" replace />;
  }

  if (requireCompany && !company && !hasRole('super_admin')) {
    return <Navigate to="/sem-empresa" replace />;
  }

  return <>{children}</>;
}
