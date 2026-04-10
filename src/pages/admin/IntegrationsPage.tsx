import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { MultiplusCardSettings } from '@/components/admin/MultiplusCardSettings';
import { PinpadSettings } from '@/components/admin/PinpadSettings';
import { NFCeSettings } from '@/components/admin/NFCeSettings';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plug } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserData() {
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (companyUser) {
        setCompanyId(companyUser.company_id);
      }
    }

    loadUserData();
  }, [user]);

  return (
    <AppLayout>
      <div className="container py-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Plug className="w-6 h-6" />
              Integrações
            </h1>
            <p className="text-muted-foreground">
              Configure integrações externas para sua empresa
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {companyId ? (
            <>
              <MultiplusCardSettings companyId={companyId} />
              <NFCeSettings companyId={companyId} />
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Carregando configurações...
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
