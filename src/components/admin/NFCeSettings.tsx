import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

interface NFCeSettingsProps {
  companyId: string;
}

export function NFCeSettings({ companyId }: NFCeSettingsProps) {
  const [apiConfigured, setApiConfigured] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [recentRecords, setRecentRecords] = useState<any[]>([]);

  useEffect(() => {
    loadSettings();
    loadRecords();
  }, [companyId]);

  async function loadSettings() {
    try {
      // Check if NFC-e API settings exist via store_settings
      const { data } = await supabase
        .from('store_settings')
        .select('*')
        .eq('company_id', companyId)
        .eq('key', 'nfce_configured')
        .maybeSingle();

      setApiConfigured(data?.value === 'true');

      // Build webhook URL
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      if (projectUrl) {
        setWebhookUrl(`${projectUrl}/functions/v1/nfce-webhook`);
      }
    } catch (error) {
      console.error('Error loading NFC-e settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecords() {
    try {
      const { data } = await supabase
        .from('nfce_records')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentRecords((data as any[]) || []);
    } catch (error) {
      console.error('Error loading NFC-e records:', error);
    }
  }

  async function markConfigured() {
    try {
      await supabase.from('store_settings').upsert({
        company_id: companyId,
        key: 'nfce_configured',
        value: 'true',
      }, { onConflict: 'company_id,key' });
      setApiConfigured(true);
      toast.success('Configuração salva!');
    } catch (error) {
      toast.error('Erro ao salvar configuração');
    }
  }

  const statusColors: Record<string, string> = {
    pendente: 'bg-yellow-500/20 text-yellow-700',
    processando: 'bg-blue-500/20 text-blue-700',
    autorizada: 'bg-green-500/20 text-green-700',
    rejeitada: 'bg-destructive/20 text-destructive',
    cancelada: 'bg-muted text-muted-foreground',
    denegada: 'bg-destructive/20 text-destructive',
  };

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
          <FileText className="w-5 h-5" />
          NFC-e - Emissão Fiscal
        </CardTitle>
        <CardDescription>
          Integração com API de emissão de NFC-e. Configure o token e webhook na plataforma fiscal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {apiConfigured ? (
            <Badge className="bg-green-500/20 text-green-700 gap-1">
              <CheckCircle className="w-3 h-3" /> Configurado
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <Clock className="w-3 h-3" /> Pendente
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <Label>URL do Webhook (configure na plataforma fiscal)</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast.success('URL copiada!');
              }}
            >
              Copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use esta URL como webhook na plataforma de NFC-e para receber atualizações de status automaticamente.
          </p>
        </div>

        {!apiConfigured && (
          <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
            <p className="font-medium">Para configurar:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Acesse a plataforma fiscal e gere um Token de API</li>
              <li>Configure o token como secret <code className="text-xs bg-background px-1 rounded">NFCE_API_KEY</code></li>
              <li>Configure a URL base como secret <code className="text-xs bg-background px-1 rounded">NFCE_API_URL</code></li>
              <li>Configure o webhook secret como <code className="text-xs bg-background px-1 rounded">NFCE_WEBHOOK_SECRET</code></li>
              <li>Cadastre o webhook URL acima na plataforma fiscal</li>
            </ol>
            <Button size="sm" onClick={markConfigured} className="mt-2">
              Marcar como Configurado
            </Button>
          </div>
        )}

        {recentRecords.length > 0 && (
          <div className="space-y-2">
            <Label>Últimas emissões</Label>
            <div className="space-y-2">
              {recentRecords.map((record) => (
                <div key={record.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                  <div>
                    <span className="font-mono text-xs">{record.external_id}</span>
                    {record.numero && <span className="ml-2 text-muted-foreground">Nº {record.numero}</span>}
                  </div>
                  <Badge className={statusColors[record.status] || ''}>
                    {record.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
