import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CreditCard, Printer, Settings, Receipt } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { usePdvSettings, type PdvSettings } from '@/hooks/usePdvSettings';

/**
 * Configurações consolidadas da Frente de Caixa.
 *
 * Escopo: apenas lojas com o módulo `mercado` ativo. Não altera nenhuma
 * tela existente — todos os toggles vivem em `pdv_settings` e são lidos
 * exclusivamente pela Frente de Caixa.
 */
export default function FrenteCaixaConfiguracoes() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { settings, loading, saving, save } = usePdvSettings(company?.id);
  const [form, setForm] = useState<PdvSettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (mercadoLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!mercadoEnabled) {
    return <Navigate to="/" replace />;
  }

  const upd = <K extends keyof PdvSettings>(key: K, value: PdvSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const { error } = await save(form);
    if (error) {
      toast.error('Falha ao salvar: ' + (error.message ?? 'erro desconhecido'));
    } else {
      toast.success('Configurações salvas.');
    }
  };

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/frente-caixa')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Configurações da Frente de Caixa</h1>
            <p className="text-sm text-muted-foreground">
              Opções exclusivas da Frente de Caixa. Não afeta PDV V2, Pedido Express, Cobrança ou impressão de pedidos online.
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      {/* Mensagem promocional */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" /> Mensagem promocional
          </CardTitle>
          <CardDescription>
            Texto livre que sai no rodapé de todo cupom impresso pela Frente de Caixa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="promo">Mensagem</Label>
          <Textarea
            id="promo"
            value={form.promo_message}
            onChange={(e) => upd('promo_message', e.target.value.slice(0, 240))}
            placeholder="Ex.: Volte sempre! Siga-nos no Instagram @sualoja"
            rows={3}
            disabled={loading}
          />
          <p className="text-[11px] text-muted-foreground">{form.promo_message.length}/240</p>
        </CardContent>
      </Card>

      {/* Preferências de impressão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" /> Preferências de impressão
          </CardTitle>
          <CardDescription>
            Liga/desliga o que sai impresso no cupom da Frente de Caixa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['print_show_customer', 'Mostrar dados do cliente'],
            ['print_show_discount', 'Mostrar desconto'],
            ['print_show_surcharge', 'Mostrar acréscimo'],
            ['print_show_serial', 'Mostrar nº de série do produto'],
            ['print_show_sale_notes', 'Mostrar observações da venda'],
            ['print_show_product_notes', 'Mostrar observações do produto'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5">
              <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={form[key]}
                onCheckedChange={(v) => upd(key, v)}
                disabled={loading}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Comportamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" /> Comportamento
          </CardTitle>
          <CardDescription>
            Regras aplicadas durante a venda na Frente de Caixa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="require_customer_above_value">
              Exigir cliente quando a venda passar de (R$)
            </Label>
            <Input
              id="require_customer_above_value"
              type="number"
              min={0}
              step="0.01"
              value={form.require_customer_above_value}
              onChange={(e) =>
                upd('require_customer_above_value', Number(e.target.value) || 0)
              }
              disabled={loading}
            />
            <p className="text-[11px] text-muted-foreground">
              Use 0 para nunca exigir. Acima desse valor a Frente de Caixa pedirá CPF/cliente antes de finalizar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Atalhos para telas existentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Outras configurações
          </CardTitle>
          <CardDescription>
            Atalhos para telas já existentes — nada aqui foi movido ou duplicado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/formas-pagamento')}
          >
            <CreditCard className="h-4 w-4" />
            Formas de pagamento
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/configuracoes/impressao')}
          >
            <Printer className="h-4 w-4" />
            Impressão (modelo 58/80mm, instalador)
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/fiscal')}
          >
            <Receipt className="h-4 w-4" />
            Fiscal / NFC-e
          </Button>
          <Separator className="my-2" />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/configuracoes')}
          >
            <Settings className="h-4 w-4" />
            Configurações gerais da loja
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}