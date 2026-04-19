import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Monitor,
  Loader2
} from 'lucide-react';

interface CompanyModulesControlProps {
  companyId: string;
}

const AVAILABLE_MODULES = [
  {
    name: 'pdv',
    label: 'PDV V1 — Sistema atual',
    description: 'Sistema de vendas atual com abertura/fechamento de caixa e formas de pagamento'
  },
  {
    name: 'pdv_v2',
    label: 'PDV V2 — Nova Central Operacional',
    description: 'Nova interface unificada com pedidos online + balcão, mesas e cobrança integrada (em testes)'
  },
  {
    name: 'mesas',
    label: 'Controle de Mesas',
    description: 'Gestão de mesas e comandas para garçons, integrado ao PDV'
  },
  {
    name: 'whatsapp',
    label: 'WhatsApp - Notificações',
    description: 'Envio automático de mensagens de status dos pedidos via WhatsApp (Evolution API)'
  },
  {
    name: 'fiscal',
    label: 'Fiscal - NFC-e',
    description: 'Configuração de regras tributárias (Simples Nacional) para emissão de NFC-e'
  },
  {
    name: 'sales_campaigns',
    label: 'Campanhas de Vendas',
    description: 'Envio em massa de mensagens promocionais para a base de clientes via WhatsApp'
  }
];

export function CompanyModulesControl({ companyId }: CompanyModulesControlProps) {
  const { modules, loading, toggleModule, isModuleEnabled } = useCompanyModules({ companyId });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Regra de exclusividade: ao ativar pdv_v2, desativa pdv. Ao ativar pdv, desativa pdv_v2.
  async function handleToggle(moduleName: string, checked: boolean) {
    if (checked && moduleName === 'pdv' && isModuleEnabled('pdv_v2')) {
      await toggleModule('pdv_v2', false);
    }
    if (checked && moduleName === 'pdv_v2' && isModuleEnabled('pdv')) {
      await toggleModule('pdv', false);
    }
    await toggleModule(moduleName, checked);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          Módulos
        </CardTitle>
        <CardDescription>
          Habilite ou desabilite módulos para esta empresa
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {AVAILABLE_MODULES.map(module => {
            const enabled = isModuleEnabled(module.name);
            const isPdvV2 = module.name === 'pdv_v2';
            return (
              <div 
                key={module.name} 
                className={`flex items-center justify-between p-4 border rounded-lg ${isPdvV2 ? 'border-primary/40 bg-primary/5' : ''}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-base font-medium">{module.label}</Label>
                    <Badge variant={enabled ? 'default' : 'secondary'}>
                      {enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {isPdvV2 && (
                      <Badge variant="outline" className="text-xs">Beta</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {module.description}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => handleToggle(module.name, checked)}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
