import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { X, Building2, Eye } from 'lucide-react';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedCompany, exitImpersonation, isSuperAdmin } = useAuthContext();
  const navigate = useNavigate();

  if (!isImpersonating || !impersonatedCompany) {
    return null;
  }

  function handleExit() {
    exitImpersonation();
    if (isSuperAdmin()) {
      navigate('/admin');
    }
  }

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-4 fixed top-0 left-0 right-0 z-50 shadow-md">
      <div className="flex items-center gap-3">
        <Eye className="w-5 h-5" />
        <span className="font-medium text-sm">
          Modo Suporte
        </span>
        <span className="hidden sm:inline text-sm">•</span>
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4" />
          <span className="font-semibold">{impersonatedCompany.name}</span>
        </div>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleExit}
        className="bg-amber-100 border-amber-600 text-amber-900 hover:bg-amber-200 hover:text-amber-950 gap-1"
      >
        <X className="w-4 h-4" />
        <span className="hidden sm:inline">Sair do modo suporte</span>
        <span className="sm:hidden">Sair</span>
      </Button>
    </div>
  );
}
