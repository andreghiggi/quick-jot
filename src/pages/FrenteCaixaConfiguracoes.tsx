import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CreditCard, Printer, Settings, Receipt, Wallet, ShoppingBag, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const { settings, loading, saving, save, reload } = usePdvSettings(company?.id);
  const [form, setForm] = useState<PdvSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
    setDirty(false);
  }, [settings]);

  const upd = <K extends keyof PdvSettings>(key: K, value: PdvSettings[K]) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const persist = useCallback(async (next: PdvSettings, opts?: { silent?: boolean; reloadAfter?: boolean }) => {
    setAutoSaving(true);
    console.log('[FrenteCaixaConfiguracoes] salvando →', next);
    const { error } = await save(next);
    if (error) {
      const detail = [
        (error as any)?.message,
        (error as any)?.details,
        (error as any)?.hint,
        (error as any)?.code,
      ]
        .filter(Boolean)
        .join(' • ');
      console.error('[FrenteCaixaConfiguracoes] save failed', error);
      toast.error('Falha ao salvar: ' + (detail || 'erro desconhecido'));
      setDirty(true);
      setAutoSaving(false);
      return false;
    }
    if (opts?.reloadAfter) {
      // Re-lê do banco pra confirmar que persistiu de fato.
      await reload();
    }
    setDirty(false);
    setAutoSaving(false);
    if (!opts?.silent) toast.success('Configurações salvas.');
    return true;
  }, [save, reload]);

  const updPersist = <K extends keyof PdvSettings>(key: K, value: PdvSettings[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setDirty(true);
    void persist(next, { silent: true });
  };

  const handleSave = async () => {
    await persist(form, { reloadAfter: true });
  };

  const busy = saving || autoSaving;

  // Após reload, se o valor do banco divergir do que tentamos enviar, avisa.
  useEffect(() => {
    if (loading || saving) return;
    if (!dirty) return;
    // se ainda está "dirty" logo após um save+reload, algo não persistiu
  }, [loading, saving, dirty]);

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
        <Button
          onClick={handleSave}
          disabled={busy || loading || !dirty}
          className="gap-2"
          variant={dirty ? 'default' : 'secondary'}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {busy ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Salvo'}
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
                  onCheckedChange={(v) => updPersist(key, v)}
                  disabled={loading || busy}
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

          {([
            ['auto_print_second_copy', 'Imprimir 2ª via automaticamente'],
            ['auto_open_drawer_cash', 'Abrir gaveta automaticamente em pagamento em dinheiro'],
            ['clear_screen_after_sale', 'Limpar tela após finalizar venda'],
            ['stock_move_on_fiscal_only', 'Movimentar estoque apenas na emissão fiscal (não baixa na venda do PDV)'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5">
              <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={form[key] as boolean}
                onCheckedChange={(v) => updPersist(key, v as any)}
                disabled={loading || busy}
              />
            </div>
          ))}

          <div className="space-y-1.5 pt-1">
            <Label htmlFor="print_on_finish_mode">Ação ao salvar a venda</Label>
            <Select
              value={form.print_on_finish_mode}
              onValueChange={(v) => updPersist('print_on_finish_mode', v as 'off' | 'auto' | 'ask')}
              disabled={loading || busy}
            >
              <SelectTrigger id="print_on_finish_mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Não imprimir</SelectItem>
                <SelectItem value="auto">Imprimir automaticamente</SelectItem>
                <SelectItem value="ask">Perguntar sempre</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Controla o que acontece com o cupom após cada venda finalizada na Frente de Caixa.
            </p>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-border">
            <Label htmlFor="default_fiscal_mode">Ação ao salvar a venda (fiscal)</Label>
            <Select
              value={form.default_fiscal_mode}
              onValueChange={(v) => updPersist('default_fiscal_mode', v as 'fiscal' | 'nao_fiscal' | 'ask')}
              disabled={loading || busy}
            >
              <SelectTrigger id="default_fiscal_mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_fiscal">Salvar como pré-venda (sem NFC-e)</SelectItem>
                <SelectItem value="fiscal">Salvar e emitir NFC-e</SelectItem>
                <SelectItem value="ask">Perguntar sempre</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Pré-venda movimenta estoque e caixa, mas não gera NFC-e — a nota pode ser emitida depois pela Lista do PDV.
              "Perguntar sempre" mostra dois botões no checkout para o operador decidir em cada venda.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Controle de caixa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Controle de caixa
          </CardTitle>
          <CardDescription>
            Regras de abertura, fechamento e movimentações manuais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['cash_control_enabled', 'Exigir caixa aberto para vender'],
            ['blind_close_enabled', 'Fechamento de caixa cego (esconde valor esperado e diferença)'],
            ['require_movement_reason', 'Exigir motivo em sangria/suprimento'],
            ['block_close_with_pending_sales', 'Bloquear fechamento com venda pendente (itens no carrinho)'],
            ['auto_print_closing_report', 'Imprimir relatório de fechamento automaticamente'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5">
              <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={form[key] as boolean}
                onCheckedChange={(v) => updPersist(key, v as any)}
                disabled={loading || busy}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Itens de venda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4" /> Itens de venda
          </CardTitle>
          <CardDescription>
            Regras aplicadas ao adicionar produtos ao carrinho.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['block_sale_without_price', 'Bloquear venda de item sem preço'],
            ['allow_price_change_on_sale', 'Permitir alterar preço na venda'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5">
              <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={form[key] as boolean}
                onCheckedChange={(v) => updPersist(key, v as any)}
                disabled={loading || busy}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="confirm_quantity_above">
              Confirmar quando a quantidade adicionada for maior que
            </Label>
            <Input
              id="confirm_quantity_above"
              type="number"
              min={0}
              step={1}
              value={form.confirm_quantity_above}
              onChange={(e) => upd('confirm_quantity_above', parseInt(e.target.value, 10) || 0)}
              disabled={loading}
            />
            <p className="text-[11px] text-muted-foreground">
              Use 0 para nunca pedir confirmação.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Impressão estendida */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" /> Cupom — extras
          </CardTitle>
          <CardDescription>
            Elementos opcionais no cupom da Frente de Caixa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['print_show_logo', 'Mostrar logo da loja no cupom'],
            ['print_show_review_qr', 'Mostrar QR Code de avaliação'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5">
              <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={form[key] as boolean}
                onCheckedChange={(v) => updPersist(key, v as any)}
                disabled={loading || busy}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="review_qr_url">URL do QR Code de avaliação</Label>
            <Input
              id="review_qr_url"
              type="url"
              placeholder="https://g.page/r/..."
              value={form.review_qr_url}
              onChange={(e) => upd('review_qr_url', e.target.value)}
              disabled={loading || !form.print_show_review_qr}
            />
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