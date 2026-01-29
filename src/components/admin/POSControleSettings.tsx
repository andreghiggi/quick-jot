import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { 
  getPOSControleConfig, 
  savePOSControleConfig, 
  POSControleConfig 
} from '@/services/posControleService';

interface POSControleSettingsProps {
  companyId: string;
}

export function POSControleSettings({ companyId }: POSControleSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [config, setConfig] = useState<POSControleConfig>({
    apiUser: '',
    apiPassword: '',
    terminalId: '',
  });

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const existingConfig = await getPOSControleConfig(companyId);
      if (existingConfig) {
        setConfig(existingConfig);
        setIsConfigured(true);
      }
    } catch (error) {
      console.error('Error loading POS Controle config:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!config.apiUser || !config.apiPassword || !config.terminalId) {
      toast.error('Preencha todos os campos');
      return;
    }

    setSaving(true);
    try {
      const success = await savePOSControleConfig(companyId, config);
      if (success) {
        setIsConfigured(true);
        toast.success('Configuração salva com sucesso!');
      } else {
        toast.error('Erro ao salvar configuração');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            <CardTitle>POS Controle</CardTitle>
          </div>
          <Badge variant={isConfigured ? 'default' : 'secondary'}>
            {isConfigured ? (
              <><Check className="w-3 h-3 mr-1" /> Configurado</>
            ) : (
              <><AlertCircle className="w-3 h-3 mr-1" /> Não configurado</>
            )}
          </Badge>
        </div>
        <CardDescription>
          Integração com maquininhas via POS Controle. Configure suas credenciais para enviar cobranças remotamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="apiUser">Usuário da API</Label>
            <Input
              id="apiUser"
              placeholder="Seu usuário POS Controle"
              value={config.apiUser}
              onChange={(e) => setConfig(prev => ({ ...prev, apiUser: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="apiPassword">Senha da API</Label>
            <div className="relative">
              <Input
                id="apiPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Sua senha POS Controle"
                value={config.apiPassword}
                onChange={(e) => setConfig(prev => ({ ...prev, apiPassword: e.target.value }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="terminalId">ID do Terminal</Label>
          <Input
            id="terminalId"
            placeholder="ID do terminal POS (ex: TERM001)"
            value={config.terminalId}
            onChange={(e) => setConfig(prev => ({ ...prev, terminalId: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            O ID do terminal é fornecido pelo POS Controle após cadastro da maquininha.
          </p>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Configuração'
            )}
          </Button>
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">Como funciona?</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Cadastre-se no POS Controle e obtenha suas credenciais</li>
            <li>Configure o terminal da sua maquininha no painel POS Controle</li>
            <li>Preencha os dados acima e salve</li>
            <li>Ao finalizar vendas no PDV, a cobrança será enviada automaticamente para a maquininha</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
