import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CreditCard, Check, AlertCircle, Eye, EyeOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  getMultiplusCardConfig,
  saveMultiplusCardConfig,
  listPinPdvDevices,
  MultiplusCardConfig,
  PinPdvDevice,
} from '@/services/multiplusCardService';

interface MultiplusCardSettingsProps {
  companyId: string;
}

export function MultiplusCardSettings({ companyId }: MultiplusCardSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [devices, setDevices] = useState<PinPdvDevice[]>([]);

  const [config, setConfig] = useState<MultiplusCardConfig>({
    apiToken: '',
    pinpdvId: '',
    pinpdvNome: '',
  });

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const existingConfig = await getMultiplusCardConfig(companyId);
      if (existingConfig) {
        setConfig(existingConfig);
        setIsConfigured(true);
      }
    } catch (error) {
      console.error('Error loading Multiplus Card config:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadDevices() {
    if (!config.apiToken) {
      toast.error('Informe o Token da API primeiro');
      return;
    }

    setLoadingDevices(true);
    try {
      // Temporarily save token to fetch devices
      const tempConfig = { ...config };
      await saveMultiplusCardConfig(companyId, tempConfig);
      
      const deviceList = await listPinPdvDevices(companyId);
      setDevices(deviceList);

      if (deviceList.length === 0) {
        toast.info('Nenhum dispositivo encontrado. Verifique se o PINPDV está ativo.');
      } else {
        toast.success(`${deviceList.length} dispositivo(s) encontrado(s)`);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('Erro ao buscar dispositivos');
    } finally {
      setLoadingDevices(false);
    }
  }

  async function handleSave() {
    if (!config.apiToken || !config.pinpdvId) {
      toast.error('Preencha o Token e selecione um dispositivo');
      return;
    }

    setSaving(true);
    try {
      const success = await saveMultiplusCardConfig(companyId, config);
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

  function handleSelectDevice(deviceId: string) {
    const device = devices.find(d => d.id.toString() === deviceId);
    setConfig(prev => ({
      ...prev,
      pinpdvId: deviceId,
      pinpdvNome: device?.nome || '',
    }));
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
            <CardTitle>Multiplus Card (PINPDV)</CardTitle>
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
          Integração TEF via PINPDV (Multiplus Card). Envie cobranças diretamente para seu SmartPOS e receba os dados de pagamento para a NFC-e.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apiToken">Token da API (longa duração)</Label>
          <div className="relative">
            <Input
              id="apiToken"
              type={showToken ? 'text' : 'password'}
              placeholder="Token fornecido pela Multiplus Card"
              value={config.apiToken}
              onChange={(e) => setConfig(prev => ({ ...prev, apiToken: e.target.value }))}
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
          <p className="text-xs text-muted-foreground">
            Token de longa duração fornecido pela Multiplus Card para sua empresa.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Dispositivo (SmartPOS)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadDevices}
              disabled={loadingDevices || !config.apiToken}
            >
              {loadingDevices ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Buscar Dispositivos
            </Button>
          </div>

          {devices.length > 0 ? (
            <Select value={config.pinpdvId} onValueChange={handleSelectDevice}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um dispositivo" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id.toString()}>
                    <div className="flex items-center gap-2">
                      {device.isAtivo ? (
                        <Wifi className="w-3 h-3 text-primary" />
                      ) : (
                        <WifiOff className="w-3 h-3 text-destructive" />
                      )}
                      {device.nome} ({device.codigo})
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="ID do dispositivo PINPDV"
                value={config.pinpdvId}
                onChange={(e) => setConfig(prev => ({ ...prev, pinpdvId: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Clique em "Buscar Dispositivos" para listar os SmartPOS disponíveis, ou informe o ID manualmente.
              </p>
            </div>
          )}
        </div>

        {config.pinpdvNome && (
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <span className="font-medium">Dispositivo selecionado:</span> {config.pinpdvNome}
          </div>
        )}

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
            <li>Contrate o PINPDV com a Multiplus Card e obtenha seu token</li>
            <li>Instale o app PINPDV no seu SmartPOS pela loja da adquirente</li>
            <li>Informe o token acima e busque os dispositivos disponíveis</li>
            <li>Ao finalizar vendas no PDV, a cobrança será enviada ao SmartPOS</li>
            <li>Os dados TEF (NSU, autorização, bandeira) retornam automaticamente para a NFC-e</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
