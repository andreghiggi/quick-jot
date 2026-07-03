import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePaymentMethods, type PaymentChannel, type PaymentMethod } from '@/hooks/usePaymentMethods';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Trash2,
  CreditCard,
  Loader2,
  GripVertical,
  Plug,
  Monitor,
  Zap,
  Globe,
  Bike,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { PaymentMethodFormDialog, type PaymentMethodDraft } from '@/components/payment-methods/PaymentMethodFormDialog';
import { usePdvSettings } from '@/hooks/usePdvSettings';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  pdv: 'PDV / Frente de Caixa',
  express: 'Pedido Express',
  menu: 'Cardápio Online',
};

const CHANNEL_DESCRIPTIONS: Record<PaymentChannel, string> = {
  pdv: 'Formas de pagamento exibidas no PDV e no Frente de Caixa',
  express: 'Formas de pagamento exibidas no fluxo de Pedido Express',
  menu: 'Formas de pagamento exibidas para clientes no cardápio público',
};

interface ChannelManagerProps {
  channel: PaymentChannel;
}

function ChannelManager({ channel }: ChannelManagerProps) {
  const { company } = useAuthContext();
  const { paymentMethods, loading, addPaymentMethod, updatePaymentMethod, deletePaymentMethod } = usePaymentMethods({
    companyId: company?.id,
    channel,
  });

  // ─── Crediário NATIVO (só existe no PDV/Frente de Caixa) ────────────────
  //   Aparece sempre como um card fixo, independente de haver ou não uma
  //   forma de pagamento cadastrada. O toggle liga/desliga direto no
  //   `pdv_settings.credit_sale_enabled` (mesmo campo consumido pelo
  //   checkout do Frente de Caixa).
  const isPdv = channel === 'pdv';
  const { enabled: financeiroEnabled } = useFinanceiroEnabled(company?.id);
  const {
    settings: pdvSettings,
    save: savePdvSettings,
    saving: savingPdv,
    loading: loadingPdv,
  } = usePdvSettings(company?.id);

  /**
   * Se já existir uma forma cadastrada como Crediário nesse canal, ela vira o
   * "back-end" do card nativo — o Editar abre o cadastro dela. Caso não exista,
   * o Editar cria automaticamente uma com os padrões do Crediário.
   */
  const crediarioMethod = paymentMethods.find(
    (m) => (m as any).payment_type === 'crediario',
  );

  async function handleToggleCrediario(next: boolean) {
    const { error } = await savePdvSettings({ ...pdvSettings, credit_sale_enabled: next });
    if (error) {
      toast.error('Não foi possível salvar. Tente novamente.');
      return;
    }
    toast.success(next ? 'Crediário ativado' : 'Crediário desativado');
  }

  async function openCrediarioEditor() {
    if (crediarioMethod) {
      openEditDialog(crediarioMethod);
      return;
    }
    // Cria a forma padrão de Crediário e abre o editor com ela.
    setIsSubmitting(true);
    const ok = await addPaymentMethod(
      {
        name: 'Crediário',
        payment_type: 'crediario',
        nfe_ref_code: '90',
        issue_nfce: false,
        active: true,
        installments_count: 1,
        installment_interval: 1,
        installment_period: 'month',
        installment_start_rule: 'general',
      } as any,
      channel,
    );
    setIsSubmitting(false);
    if (!ok) return;
    // aguarda o próximo tick pra pegar o item recém-inserido no state
    setTimeout(() => {
      const justCreated = paymentMethods.find((m) => (m as any).payment_type === 'crediario');
      if (justCreated) openEditDialog(justCreated);
      else setAddDialog(true);
    }, 100);
  }

  // Divisão Entrega/Retirada nas formas de pagamento — liberado para todas as lojas
  // nas abas Cardápio Online e Pedido Express (PDV não tem conceito de modalidade).
  const showModalitySplit = channel === 'menu' || channel === 'express';

  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmitCreate(draft: PaymentMethodDraft): Promise<boolean> {
    if (showModalitySplit && !draft.show_for_delivery && !draft.show_for_pickup) {
      toast.error('Marque ao menos Entrega ou Retirada');
      return false;
    }
    setIsSubmitting(true);
    const ok = await addPaymentMethod(draft as any, channel);
    setIsSubmitting(false);
    return ok;
  }

  async function handleSubmitEdit(draft: PaymentMethodDraft): Promise<boolean> {
    if (!editingMethod) return false;
    if (showModalitySplit && !draft.show_for_delivery && !draft.show_for_pickup) {
      toast.error('Marque ao menos Entrega ou Retirada');
      return false;
    }
    setIsSubmitting(true);
    const ok = await updatePaymentMethod(editingMethod.id, draft as any);
    setIsSubmitting(false);
    if (ok) setEditingMethod(null);
    return ok;
  }

  async function handleDelete() {
    if (!deletingMethodId) return;

    setIsSubmitting(true);
    const success = await deletePaymentMethod(deletingMethodId);
    setIsSubmitting(false);

    if (success) {
      setDeleteDialog(false);
      setDeletingMethodId(null);
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    await updatePaymentMethod(id, { active });
  }

  function openEditDialog(method: PaymentMethod) {
    setEditingMethod(method);
    setEditDialog(true);
  }

  function openDeleteDialog(id: string) {
    setDeletingMethodId(id);
    setDeleteDialog(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                {CHANNEL_LABELS[channel]}
              </CardTitle>
              <CardDescription>{CHANNEL_DESCRIPTIONS[channel]}</CardDescription>
            </div>
            <Button onClick={() => setAddDialog(true)} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Forma</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isPdv && (
            <div
              className={`mb-3 flex items-center justify-between gap-3 p-4 rounded-lg border-2 ${
                pdvSettings.credit_sale_enabled && financeiroEnabled
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-dashed border-muted-foreground/30 bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <CreditCard className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">Crediário</span>
                    <Badge variant="secondary" className="text-[10px] uppercase">Nativo</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Venda 100% no fiado, exige cliente e gera título em Contas a Receber. Não emite NFC-e.
                  </p>
                  {!financeiroEnabled && (
                    <p className="text-xs text-destructive mt-1">
                      Requer o módulo <Link to="/financeiro" className="underline">Financeiro</Link> ativo.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm text-muted-foreground">Ativo</span>
                <Switch
                  checked={!!pdvSettings.credit_sale_enabled}
                  disabled={!financeiroEnabled || loadingPdv || savingPdv}
                  onCheckedChange={handleToggleCrediario}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={openCrediarioEditor}
                  disabled={isSubmitting}
                  title="Editar configurações do Crediário"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {paymentMethods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Nenhuma forma de pagamento cadastrada para {CHANNEL_LABELS[channel]}</p>
              <Button onClick={() => setAddDialog(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Forma de Pagamento
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {paymentMethods
                .filter((m) => !(isPdv && (m as any).payment_type === 'crediario'))
                .map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <CreditCard className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium">{method.name}</span>
                      {method.pix_key && (
                        <p className="text-xs text-muted-foreground truncate">Chave: {method.pix_key}</p>
                      )}
                      {method.integration_type && (
                        <p className="text-xs text-primary font-medium flex items-center gap-1">
                          <Plug className="w-3 h-3" />
                          {method.integration_type === 'tef_pinpad' ? 'TEF PinPad' : method.integration_type === 'tef_smartpos' ? 'TEF SmartPOS' : method.integration_type}
                        </p>
                      )}
                      {showModalitySplit && (
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          <span className={`flex items-center gap-1 ${(method as any).show_for_delivery ? 'text-foreground' : 'opacity-40 line-through'}`}>
                            <Bike className="w-3 h-3" /> Entrega
                          </span>
                          <span className={`flex items-center gap-1 ${(method as any).show_for_pickup ? 'text-foreground' : 'opacity-40 line-through'}`}>
                            <Store className="w-3 h-3" /> Retirada
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Ativo</span>
                      <Switch
                        checked={method.active}
                        onCheckedChange={(checked) => handleToggleActive(method.id, checked)}
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(method)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => openDeleteDialog(method.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick add common methods */}
      {paymentMethods.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adicionar formas comuns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {['Dinheiro', 'PIX', 'Cartão de Débito', 'Cartão de Crédito'].map(name => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  onClick={() => addPaymentMethod(name, undefined, undefined, channel)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <PaymentMethodFormDialog
        open={addDialog}
        onOpenChange={setAddDialog}
        channel={channel}
        mode="create"
        busy={isSubmitting}
        onSubmit={handleSubmitCreate}
      />

      <PaymentMethodFormDialog
        open={editDialog}
        onOpenChange={(o) => { setEditDialog(o); if (!o) setEditingMethod(null); }}
        channel={channel}
        mode="edit"
        initial={editingMethod}
        busy={isSubmitting}
        onSubmit={handleSubmitEdit}
      />

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Forma de Pagamento</DialogTitle>
          </DialogHeader>
          <p>Tem certeza que deseja excluir esta forma de pagamento?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PaymentMethods() {
  const [activeChannel, setActiveChannel] = useState<PaymentChannel>('menu');

  return (
    <AppLayout title="Formas de Pagamento">
      <div className="max-w-3xl mx-auto space-y-4">
        <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as PaymentChannel)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="menu" className="gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Cardápio Online</span>
              <span className="sm:hidden">Cardápio</span>
            </TabsTrigger>
            <TabsTrigger value="pdv" className="gap-2">
              <Monitor className="w-4 h-4" />
              PDV
            </TabsTrigger>
            <TabsTrigger value="express" className="gap-2">
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Pedido Express</span>
              <span className="sm:hidden">Express</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="mt-4">
            <ChannelManager channel="menu" />
          </TabsContent>
          <TabsContent value="pdv" className="mt-4">
            <ChannelManager channel="pdv" />
          </TabsContent>
          <TabsContent value="express" className="mt-4">
            <ChannelManager channel="express" />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
