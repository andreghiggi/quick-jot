import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, AlertCircle, Eye, EyeOff, Wifi, WifiOff, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  getPinpadConfig,
  savePinpadConfig,
  checkPinpadActive,
  PinpadConfig,
} from '@/services/pinpadService';

interface PinpadSettingsProps {
  companyId: string;
}

export function PinpadSettings({ companyId }: PinpadSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [gerenciadorActive, setGerenciadorActive] = useState<boolean | null>(null);

  const [config, setConfig] = useState<PinpadConfig>({
    token: '',
    cnpj: '',
    pdv: '001',
  });

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const existing = await getPinpadConfig(companyId);
      if (existing) {
        setConfig(existing);
        setIsConfigured(true);
      }
    } catch (error) {
      console.error('Error loading PinPad config:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!config.token || !config.cnpj || !config.pdv) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (config.cnpj.replace(/\D/g, '').length !== 14) {
      toast.error('CNPJ deve ter 14 dígitos');
      return;
    }

    if (config.pdv.length !== 3) {
      toast.error('Número do PDV deve ter 3 caracteres (ex: 001)');
      return;
    }

    setSaving(true);
    try {
      const success = await savePinpadConfig(companyId, {
        ...config,
        cnpj: config.cnpj.replace(/\D/g, ''),
      });
      if (success) {
        setIsConfigured(true);
        toast.success('Configuração PinPad salva com sucesso!');
      } else {
        toast.error('Erro ao salvar configuração');
      }
    } catch (error) {
      console.error('Error saving PinPad config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!config.token || !config.cnpj || !config.pdv) {
      toast.error('Salve a configuração antes de testar');
      return;
    }

    setTesting(true);
    setGerenciadorActive(null);
    try {
      // Save first to ensure edge function can read config
      await savePinpadConfig(companyId, {
        ...config,
        cnpj: config.cnpj.replace(/\D/g, ''),
      });

      const result = await checkPinpadActive(companyId);
      setGerenciadorActive(result.active);

      if (result.active) {
        toast.success('Gerenciador de Pagamentos está ativo! ✅');
      } else {
        toast.error(`Gerenciador não respondeu: ${result.message || 'Verifique se está rodando'}`);
      }
    } catch (error) {
      setGerenciadorActive(false);
      toast.error('Erro ao testar conexão');
    } finally {
      setTesting(false);
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
            <MonitorSmartphone className="w-5 h-5" />
            <CardTitle>TEF WebService (PinPad)</CardTitle>
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
          Integração TEF via WebService para PinPad conectado ao computador. O Gerenciador de Pagamentos Multiplus Card deve estar instalado e ativo na máquina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pinpad-token">Token TEF WebService</Label>
          <div className="relative">
            <Input
              id="pinpad-token"
              type={showToken ? 'text' : 'password'}
              placeholder="Token fornecido pela Multiplus Card"
              value={config.token}
              onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pinpad-cnpj">CNPJ (somente números)</Label>
            <Input
              id="pinpad-cnpj"
              placeholder="12345678000100"
              maxLength={18}
              value={config.cnpj}
              onChange={(e) => setConfig(prev => ({ ...prev, cnpj: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pinpad-pdv">Número do PDV (3 caracteres)</Label>
            <Input
              id="pinpad-pdv"
              placeholder="001"
              maxLength={3}
              value={config.pdv}
              onChange={(e) => setConfig(prev => ({ ...prev, pdv: e.target.value.padStart(3, '0').slice(-3) }))}
            />
          </div>
        </div>

        {gerenciadorActive !== null && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${gerenciadorActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {gerenciadorActive ? (
              <><Wifi className="w-4 h-4" /> Gerenciador de Pagamentos ativo e respondendo</>
            ) : (
              <><WifiOff className="w-4 h-4" /> Gerenciador de Pagamentos não respondeu. Verifique se está instalado e rodando.</>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleTestConnection} disabled={testing || !config.token}>
            {testing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando...</>
            ) : (
              <><Wifi className="w-4 h-4 mr-2" />Testar Conexão (ATV)</>
            )}
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
            ) : (
              'Salvar Configuração'
            )}
          </Button>
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">Como funciona?</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Instale o Gerenciador de Pagamentos Multiplus Card no computador do PDV</li>
            <li>Conecte o PinPad via USB ao computador</li>
            <li>Obtenha o Token TEF WebService com a Multiplus Card</li>
            <li>Informe o CNPJ da empresa e o número do PDV acima</li>
            <li>Clique em "Testar Conexão" para verificar se o Gerenciador está ativo</li>
            <li>Ao finalizar vendas no PDV, o pagamento será processado pelo PinPad</li>
            <li>Os dados TEF (NSU, autorização, bandeira) retornam automaticamente para a NFC-e</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
