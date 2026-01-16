import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { CompanyModulesControl } from '@/components/admin/CompanyModulesControl';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function CompanyModulesPage() {
  const { companyId } = useParams<{ companyId: string }>();

  if (!companyId) {
    return <div>ID da empresa não encontrado</div>;
  }

  const headerActions = (
    <Link to="/admin">
      <Button variant="outline" className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </Button>
    </Link>
  );

  return (
    <AppLayout title="Módulos da Empresa" actions={headerActions}>
      <div className="max-w-2xl mx-auto">
        <CompanyModulesControl companyId={companyId} />
      </div>
    </AppLayout>
  );
}
