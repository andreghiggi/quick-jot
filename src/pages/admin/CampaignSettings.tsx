import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Megaphone } from 'lucide-react';

interface Settings {
  id: string;
  interval_seconds: number;
  max_per_day: number;
  start_hour: number;
  end_hour: number;
}

export default function CampaignSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('campaign_settings').select('*').limit(1).maybeSingle()
      .then(({ data }) => { setSettings(data as Settings); setLoading(false); });
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from('campaign_settings').update({
      interval_seconds: settings.interval_seconds,
      max_per_day: settings.max_per_day,
      start_hour: settings.start_hour,
      end_hour: settings.end_hour,
    }).eq('id', settings.id);
    if (error) toast.error('Erro ao salvar');
    else toast.success('Configurações atualizadas');
    setSaving(false);
  }

  if (loading) return <AppLayout><div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div></AppLayout>;
  if (!settings) return <AppLayout><div className="p-10">Sem configuração encontrada.</div></AppLayout>;

  const set = (k: keyof Settings, v: number) => setSettings({ ...settings, [k]: v });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">Configurações de Campanhas</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Limites de envio</CardTitle>
            <CardDescription>Aplicado globalmente a todas as campanhas de vendas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Intervalo entre mensagens (segundos)</Label>
                <Input type="number" min={5} value={settings.interval_seconds}
                  onChange={e => set('interval_seconds', parseInt(e.target.value || '0'))} />
              </div>
              <div>
                <Label>Máximo de mensagens por dia</Label>
                <Input type="number" min={1} value={settings.max_per_day}
                  onChange={e => set('max_per_day', parseInt(e.target.value || '0'))} />
              </div>
              <div>
                <Label>Horário de início (0-23)</Label>
                <Input type="number" min={0} max={23} value={settings.start_hour}
                  onChange={e => set('start_hour', parseInt(e.target.value || '0'))} />
              </div>
              <div>
                <Label>Horário de fim (0-23)</Label>
                <Input type="number" min={0} max={23} value={settings.end_hour}
                  onChange={e => set('end_hour', parseInt(e.target.value || '0'))} />
              </div>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : 'Salvar'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
