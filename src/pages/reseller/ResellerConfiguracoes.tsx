import { useState, useEffect } from 'react';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Lock, AlertCircle } from 'lucide-react';

export default function ResellerConfiguracoes() {
  const { reseller, settings, loading, updateProfile, updateSettings } = useResellerPortal();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [asaasKey, setAsaasKey] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (reseller) {
      setName(reseller.name);
      setEmail(reseller.email);
      setPhone(reseller.phone || '');
    }
    if (settings) {
      setDueDay(String(settings.invoice_due_day));
      setAsaasKey(settings.asaas_api_key || '');
    }
  }, [reseller, settings]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    await updateProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
    });
    setSavingProfile(false);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    await updateSettings({
      invoice_due_day: parseInt(dueDay),
      asaas_api_key: asaasKey.trim() || null,
    });
    setSavingSettings(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ResellerLayout title="Configurações">
      <div className="space-y-6 max-w-2xl">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
            <CardDescription>Seus dados de contato</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} disabled={savingProfile} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={savingProfile} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" disabled={savingProfile} />
              </div>
              <Button type="submit" disabled={savingProfile} className="gap-2">
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Perfil
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Billing settings */}
        <Card>
          <CardHeader>
            <CardTitle>Faturamento</CardTitle>
            <CardDescription>Configurações de cobrança</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="space-y-2">
                <Label>Dia de vencimento da fatura</Label>
                <Select value={dueDay} onValueChange={setDueDay} disabled={savingSettings}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Dia 5</SelectItem>
                    <SelectItem value="10">Dia 10</SelectItem>
                    <SelectItem value="15">Dia 15</SelectItem>
                    <SelectItem value="20">Dia 20</SelectItem>
                    <SelectItem value="25">Dia 25</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Read-only fees */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Lock className="w-3 h-3" />
                  Valores (somente leitura)
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Taxa de ativação</p>
                    <p className="text-sm font-medium">
                      R$ {(settings?.activation_fee || 180).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Mensalidade</p>
                    <p className="text-sm font-medium">
                      R$ {(settings?.monthly_fee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estes valores são definidos pelo administrador master.
                </p>
              </div>

              <Separator />

              {/* Asaas API Key */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Chave API Asaas
                  <Badge variant="outline" className="text-xs">Em breve</Badge>
                </Label>
                <Input
                  type="password"
                  value={asaasKey}
                  onChange={e => setAsaasKey(e.target.value)}
                  placeholder="Chave será utilizada para integração de cobranças"
                  disabled={savingSettings}
                />
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>A integração com Asaas será ativada em breve. Você já pode deixar sua chave configurada.</span>
                </div>
              </div>

              <Button type="submit" disabled={savingSettings} className="gap-2">
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configurações
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ResellerLayout>
  );
}
