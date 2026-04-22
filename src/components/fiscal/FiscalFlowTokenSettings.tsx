import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KeyRound, CheckCircle, Clock, Loader2, Eye, EyeOff } from 'lucide-react';

interface FiscalFlowTokenSettingsProps {
  companyId: string;
}

const SETTING_KEY = 'fiscal_flow_api_token';

export function FiscalFlowTokenSettings({ companyId }: FiscalFlowTokenSettingsProps) {
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', SETTING_KEY)
          .maybeSingle();

        const v = data?.value || '';
        setSavedToken(v);
        setToken(v);
      } catch (error) {
        console.error('Error loading Fiscal Flow token:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from('store_settings').upsert(
        {
          company_id: companyId,
          key: SETTING_KEY,
          value: token.trim(),
        },
        { onConflict: 'company_id,key' }
      );
      if (error) throw error;
      setSavedToken(token.trim());
      toast.success('Token salvo com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar token');
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

  const configured = savedToken.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          Token da API Fiscal Flow
        </CardTitle>
        <CardDescription>
          Informe o token de acesso fornecido pela plataforma Fiscal Flow para emissão de NFC-e.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {configured ? (
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
          <Label>Token</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={show ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole aqui o token da Fiscal Flow"
                className="font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={show ? 'Ocultar token' : 'Mostrar token'}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={save} disabled={saving || token.trim() === savedToken}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O token é armazenado de forma segura por loja e usado nas chamadas à API Fiscal Flow.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
