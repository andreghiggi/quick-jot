import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { generatePixPayload } from '@/utils/pixPayload';

interface PixSettingsProps {
  companyId: string;
}

const SETTINGS_KEYS = ['pix_key', 'pix_name', 'pix_city'];

export function PixSettings({ companyId }: PixSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixName, setPixName] = useState('');
  const [pixCity, setPixCity] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('store_settings')
        .select('key, value')
        .eq('company_id', companyId)
        .in('key', SETTINGS_KEYS);

      const config: Record<string, string> = {};
      (data || []).forEach(s => { if (s.value) config[s.key] = s.value; });

      setPixKey(config.pix_key || '');
      setPixName(config.pix_name || '');
      setPixCity(config.pix_city || '');
      setIsConfigured(!!(config.pix_key && config.pix_name && config.pix_city));
    } catch (error) {
      console.error('Error loading PIX config:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!pixKey.trim() || !pixName.trim() || !pixCity.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }

    setSaving(true);
    try {
      const settings = [
        { key: 'pix_key', value: pixKey.trim() },
        { key: 'pix_name', value: pixName.trim() },
        { key: 'pix_city', value: pixCity.trim() },
      ];

      for (const setting of settings) {
        const { data: existing } = await supabase
          .from('store_settings')
          .select('id')
          .eq('company_id', companyId)
          .eq('key', setting.key)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('store_settings')
            .update({ value: setting.value })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('store_settings')
            .insert({ company_id: companyId, key: setting.key, value: setting.value });
        }
      }

      setIsConfigured(true);
      toast.success('Configuração PIX salva!');
    } catch (error) {
      console.error('Error saving PIX config:', error);
      toast.error('Erro ao salvar configuração PIX');
    } finally {
      setSaving(false);
    }
  }

  // Generate preview payload
  const previewPayload = pixKey && pixName && pixCity
    ? generatePixPayload({
        pixKey,
        merchantName: pixName,
        merchantCity: pixCity,
        amount: 1.00,
        txId: 'TESTE',
      })
    : null;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              PIX QR Code
            </CardTitle>
            <CardDescription>
              Configure a chave PIX para gerar QR Codes no PDV
            </CardDescription>
          </div>
          <Badge variant={isConfigured ? 'default' : 'secondary'}>
            {isConfigured ? 'Configurado' : 'Não configurado'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Chave PIX *</Label>
            <Input
              placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A chave PIX cadastrada no banco para receber pagamentos
            </p>
          </div>
          <div className="space-y-2">
            <Label>Nome do Beneficiário *</Label>
            <Input
              placeholder="Nome da empresa ou titular"
              value={pixName}
              onChange={(e) => setPixName(e.target.value)}
              maxLength={25}
            />
          </div>
          <div className="space-y-2">
            <Label>Cidade *</Label>
            <Input
              placeholder="Ex: SAO PAULO"
              value={pixCity}
              onChange={(e) => setPixCity(e.target.value)}
              maxLength={15}
            />
          </div>
        </div>

        {previewPayload && (
          <div className="flex flex-col items-center gap-2 p-4 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground font-medium">Prévia do QR Code (R$ 1,00)</p>
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={previewPayload} size={150} level="M" />
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Salvar Configuração PIX
        </Button>
      </CardContent>
    </Card>
  );
}
