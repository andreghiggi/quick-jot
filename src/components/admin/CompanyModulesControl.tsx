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
    label: 'PDV - Ponto de Venda',
    description: 'Sistema de vendas com abertura/fechamento de caixa e formas de pagamento'
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
            return (
              <div 
                key={module.name} 
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-medium">{module.label}</Label>
                    <Badge variant={enabled ? 'default' : 'secondary'}>
                      {enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {module.description}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => toggleModule(module.name, checked)}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
