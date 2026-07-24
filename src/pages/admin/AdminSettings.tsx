import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Building2, User, Zap, Mail, ImageIcon } from 'lucide-react';

function maskCNPJ(v: string) {
  return v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18);
}

function maskCPF(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14);
}

function maskCEP(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

interface FormData {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  endereco_rua: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_estado: string;
  endereco_cep: string;
  email_comercial: string;
  email_financeiro: string;
  email_suporte: string;
  telefone: string;
  whatsapp: string;
  site: string;
  logo_url: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  responsavel_rg: string;
  responsavel_cargo: string;
  responsavel_email: string;
  responsavel_telefone: string;
  asaas_env: string;
}

const emptyForm: FormData = {
  razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', inscricao_municipal: '',
  endereco_rua: '', endereco_numero: '', endereco_complemento: '', endereco_bairro: '',
  endereco_cidade: '', endereco_estado: '', endereco_cep: '',
  email_comercial: '', email_financeiro: '', email_suporte: '',
  telefone: '', whatsapp: '', site: '', logo_url: '',
  responsavel_nome: '', responsavel_cpf: '', responsavel_rg: '', responsavel_cargo: '',
  responsavel_email: '', responsavel_telefone: '',
  asaas_env: 'sandbox',
};

export default function AdminSettings() {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (data) {
        setRecordId(data.id);
        const d = data as any;
        setForm({
          razao_social: d.razao_social || '',
          nome_fantasia: d.nome_fantasia || '',
          cnpj: d.cnpj || '',
          inscricao_estadual: d.inscricao_estadual || '',
          inscricao_municipal: d.inscricao_municipal || '',
          endereco_rua: d.endereco_rua || '',
          endereco_numero: d.endereco_numero || '',
          endereco_complemento: d.endereco_complemento || '',
          endereco_bairro: d.endereco_bairro || '',
          endereco_cidade: d.endereco_cidade || '',
          endereco_estado: d.endereco_estado || '',
          endereco_cep: d.endereco_cep || '',
          email_comercial: d.email_comercial || '',
          email_financeiro: d.email_financeiro || '',
          email_suporte: d.email_suporte || '',
          telefone: d.telefone || '',
          whatsapp: d.whatsapp || '',
          site: d.site || '',
          logo_url: d.logo_url || '',
          responsavel_nome: d.responsavel_nome || '',
          responsavel_cpf: d.responsavel_cpf || '',
          responsavel_rg: d.responsavel_rg || '',
          responsavel_cargo: d.responsavel_cargo || '',
          responsavel_email: d.responsavel_email || '',
          responsavel_telefone: d.responsavel_telefone || '',
          asaas_env: d.asaas_env || 'sandbox',
        });
      }
      setLoading(false);
    })();
  }, []);

  const set = (field: keyof FormData, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (recordId) {
        const { error } = await supabase.from('admin_settings').update(form as any).eq('id', recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('admin_settings').insert(form as any).select().single();
        if (error) throw error;
        if (data) setRecordId(data.id);
      }
      toast.success('Dados salvos com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">Minha Empresa</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Razão Social</Label>
                <Input value={form.razao_social} onChange={e => set('razao_social', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={e => set('cnpj', maskCNPJ(e.target.value))} placeholder="XX.XXX.XXX/XXXX-XX" maxLength={18} />
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} placeholder="ISENTO ou nº da IE" />
              </div>
              <div>
                <Label>Inscrição Municipal</Label>
                <Input value={form.inscricao_municipal} onChange={e => set('inscricao_municipal', e.target.value)} />
              </div>
              <div>
                <Label>Site</Label>
                <Input value={form.site} onChange={e => set('site', e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={form.endereco_cep} onChange={e => set('endereco_cep', maskCEP(e.target.value))} placeholder="XXXXX-XXX" maxLength={9} />
              </div>
              <div className="md:col-span-2">
                <Label>Rua</Label>
                <Input value={form.endereco_rua} onChange={e => set('endereco_rua', e.target.value)} />
              </div>
              <div>
                <Label>Número</Label>
                <Input value={form.endereco_numero} onChange={e => set('endereco_numero', e.target.value)} />
              </div>
              <div>
                <Label>Complemento</Label>
                <Input value={form.endereco_complemento} onChange={e => set('endereco_complemento', e.target.value)} />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={form.endereco_bairro} onChange={e => set('endereco_bairro', e.target.value)} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={form.endereco_cidade} onChange={e => set('endereco_cidade', e.target.value)} />
              </div>
              <div>
                <Label>Estado</Label>
                <Input value={form.endereco_estado} onChange={e => set('endereco_estado', e.target.value)} maxLength={2} placeholder="UF" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Contatos</CardTitle>
            <CardDescription>E-mails e telefones institucionais usados em comunicações e faturas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>E-mail Comercial</Label>
                <Input type="email" value={form.email_comercial} onChange={e => set('email_comercial', e.target.value)} />
              </div>
              <div>
                <Label>E-mail Financeiro</Label>
                <Input type="email" value={form.email_financeiro} onChange={e => set('email_financeiro', e.target.value)} />
              </div>
              <div>
                <Label>E-mail Suporte</Label>
                <Input type="email" value={form.email_suporte} onChange={e => set('email_suporte', e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={e => set('telefone', maskPhone(e.target.value))} placeholder="(XX) XXXXX-XXXX" maxLength={15} />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => set('whatsapp', maskPhone(e.target.value))} placeholder="(XX) XXXXX-XXXX" maxLength={15} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Dados do Responsável</CardTitle>
            <CardDescription>Responsável legal da ComandaTech.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Nome Completo</Label>
                <Input value={form.responsavel_nome} onChange={e => set('responsavel_nome', e.target.value)} />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={form.responsavel_cpf} onChange={e => set('responsavel_cpf', maskCPF(e.target.value))} placeholder="XXX.XXX.XXX-XX" maxLength={14} />
              </div>
              <div>
                <Label>RG</Label>
                <Input value={form.responsavel_rg} onChange={e => set('responsavel_rg', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Cargo</Label>
                <Input value={form.responsavel_cargo} onChange={e => set('responsavel_cargo', e.target.value)} placeholder="Sócio, Administrador, Diretor..." />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.responsavel_email} onChange={e => set('responsavel_email', e.target.value)} />
              </div>
              <div>
                <Label>Telefone / WhatsApp</Label>
                <Input value={form.responsavel_telefone} onChange={e => set('responsavel_telefone', maskPhone(e.target.value))} placeholder="(XX) XXXXX-XXXX" maxLength={15} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5" /> Identidade Visual</CardTitle>
            <CardDescription>Logo institucional usado em faturas e comunicações do painel administrativo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
              <div>
                <Label>URL do Logo</Label>
                <Input value={form.logo_url} onChange={e => set('logo_url', e.target.value)} placeholder="https://..." />
              </div>
              {form.logo_url && (
                <div className="border rounded p-2 bg-muted/30">
                  <img src={form.logo_url} alt="Logo" className="h-16 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> Integração Asaas</CardTitle>
            <CardDescription>
              Configure o ambiente para gerar cobranças PIX/Boleto dos revendedores. A chave de API é gerenciada via secrets seguros.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Ambiente</Label>
                <Select value={form.asaas_env} onValueChange={(v) => set('asaas_env', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                    <SelectItem value="production">Produção (cobranças reais)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Sandbox: cobranças simuladas. Produção: cobranças reais.
                </p>
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-muted-foreground">
                  <strong>Webhook URL</strong> (configure no Asaas):
                </p>
                <code className="text-xs bg-muted p-2 rounded break-all">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-billing`}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando...</> : 'Salvar'}
        </Button>
      </div>
    </AppLayout>
  );
}
