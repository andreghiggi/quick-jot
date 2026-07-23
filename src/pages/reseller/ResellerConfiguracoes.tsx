import { useState, useEffect } from 'react';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Lock } from 'lucide-react';

export default function ResellerConfiguracoes() {
  const { reseller, settings, loading, updateProfile } = useResellerPortal();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (reseller) {
      setName(reseller.name);
      setEmail(reseller.email);
      setPhone(reseller.phone || '');
    }
  }, [reseller]);

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
            <CardDescription>Valores definidos pelo administrador</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </ResellerLayout>
  );
}
