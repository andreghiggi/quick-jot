import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { SuspendedStoreScreen } from '@/components/SuspendedStoreScreen';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: AppRole;
  requireCompany?: boolean;
}

interface SuspendInfo {
  suspended: boolean;
  resellerName: string | null;
  resellerPhone: string | null;
  licenseStatus: string;
  blockReason: string | null;
  blockMessage: string | null;
}

export function ProtectedRoute({ children, requiredRole, requireCompany = false }: ProtectedRouteProps) {
  const { user, loading, hasRole, company, isImpersonating } = useAuthContext();
  const [suspendCheck, setSuspendCheck] = useState<SuspendInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Skip suspension check for super_admin and resellers, and when impersonating
    if (!company || isImpersonating || hasRole('super_admin') || hasRole('reseller')) {
      setSuspendCheck(null);
      return;
    }
    void checkSuspension(company.id);
  }, [company?.id, isImpersonating]);

  async function checkSuspension(companyId: string) {
    setChecking(true);
    try {
      const { data: suspended } = await supabase.rpc('is_company_suspended', {
        _company_id: companyId,
      });

      if (suspended) {
        const { data: comp } = await supabase
          .from('companies')
          .select('reseller_id, license_status, license_block_reason, license_block_message')
          .eq('id', companyId)
          .maybeSingle();

        let resellerName: string | null = null;
        let resellerPhone: string | null = null;
        if (comp?.reseller_id) {
          const { data: r } = await supabase
            .from('resellers')
            .select('name, phone')
            .eq('id', comp.reseller_id)
            .maybeSingle();
          resellerName = r?.name ?? null;
          resellerPhone = r?.phone ?? null;
        }
        setSuspendCheck({
          suspended: true,
          resellerName,
          resellerPhone,
          licenseStatus: (comp as any)?.license_status || 'active',
          blockReason: (comp as any)?.license_block_reason ?? null,
          blockMessage: (comp as any)?.license_block_message ?? null,
        });
      } else {
        setSuspendCheck({ suspended: false, resellerName: null, resellerPhone: null, licenseStatus: 'active', blockReason: null, blockMessage: null });
      }
    } catch (err) {
      console.error('Error checking suspension:', err);
      setSuspendCheck({ suspended: false, resellerName: null, resellerPhone: null, licenseStatus: 'active', blockReason: null, blockMessage: null });
    } finally {
      setChecking(false);
    }
  }

  if (loading || checking) {
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

  if (requireCompany && !company && !hasRole('super_admin') && !hasRole('reseller')) {
    return <Navigate to="/sem-empresa" replace />;
  }

  if (suspendCheck?.suspended) {
    return (
      <SuspendedStoreScreen
        companyName={company?.name}
        resellerName={suspendCheck.resellerName}
        resellerPhone={suspendCheck.resellerPhone}
        licenseStatus={suspendCheck.licenseStatus}
        blockReason={suspendCheck.blockReason}
        blockMessage={suspendCheck.blockMessage}
      />
    );
  }

  return <>{children}</>;
}
