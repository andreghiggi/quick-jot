import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePaymentMethods, type PaymentChannel } from '@/hooks/usePaymentMethods';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  pdv: 'PDV',
  express: 'Pedido Express',
  menu: 'Cardápio Online',
};

const CHANNEL_DESCRIPTIONS: Record<PaymentChannel, string> = {
  pdv: 'Formas de pagamento exibidas no caixa do PDV',
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

  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodPixKey, setNewMethodPixKey] = useState('');
  const [newMethodIntegration, setNewMethodIntegration] = useState<string>('none');
  const [editingMethod, setEditingMethod] = useState<{ id: string; name: string; pix_key: string; integration_type: string } | null>(null);
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPixName = (name: string) => name.toLowerCase().includes('pix');

  async function handleAdd() {
    if (!newMethodName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSubmitting(true);
    const pixKey = isPixName(newMethodName) ? newMethodPixKey.trim() || undefined : undefined;
    const integType = newMethodIntegration !== 'none' ? newMethodIntegration : undefined;
    const success = await addPaymentMethod(newMethodName.trim(), pixKey, integType, channel);
    setIsSubmitting(false);

    if (success) {
      setAddDialog(false);
      setNewMethodName('');
      setNewMethodPixKey('');
      setNewMethodIntegration('none');
    }
  }

  async function handleEdit() {
    if (!editingMethod || !editingMethod.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSubmitting(true);
    const updateData: any = { name: editingMethod.name.trim() };
    if (isPixName(editingMethod.name)) {
      updateData.pix_key = editingMethod.pix_key?.trim() || null;
    } else {
      updateData.pix_key = null;
    }
    updateData.integration_type = editingMethod.integration_type !== 'none' ? editingMethod.integration_type : null;
    const success = await updatePaymentMethod(editingMethod.id, updateData);
    setIsSubmitting(false);

    if (success) {
      setEditDialog(false);
      setEditingMethod(null);
    }
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

  function openEditDialog(method: { id: string; name: string; pix_key?: string | null; integration_type?: string | null }) {
    setEditingMethod({ id: method.id, name: method.name, pix_key: method.pix_key || '', integration_type: method.integration_type || 'none' });
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
              {paymentMethods.map((method) => (
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

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Forma de Pagamento — {CHANNEL_LABELS[channel]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Cartão de Crédito"
                value={newMethodName}
                onChange={(e) => setNewMethodName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            {isPixName(newMethodName) && (
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input
                  placeholder="Ex: email@exemplo.com, CPF, CNPJ ou telefone"
                  value={newMethodPixKey}
                  onChange={(e) => setNewMethodPixKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Essa chave será exibida para o cliente no cardápio</p>
              </div>
            )}
            {channel === 'pdv' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Plug className="w-3 h-3" /> Integração</Label>
                <Select value={newMethodIntegration} onValueChange={setNewMethodIntegration}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="tef_pinpad">TEF PinPad (WebService)</SelectItem>
                    <SelectItem value="tef_smartpos">TEF SmartPOS (PINPDV)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Ao selecionar esta forma no PDV, o TEF será acionado automaticamente</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Forma de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Cartão de Crédito"
                value={editingMethod?.name || ''}
                onChange={(e) => setEditingMethod(prev => prev ? { ...prev, name: e.target.value } : null)}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
              />
            </div>
            {editingMethod && isPixName(editingMethod.name) && (
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input
                  placeholder="Ex: email@exemplo.com, CPF, CNPJ ou telefone"
                  value={editingMethod.pix_key || ''}
                  onChange={(e) => setEditingMethod(prev => prev ? { ...prev, pix_key: e.target.value } : null)}
                />
                <p className="text-xs text-muted-foreground">Essa chave será exibida para o cliente no cardápio</p>
              </div>
            )}
            {channel === 'pdv' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Plug className="w-3 h-3" /> Integração</Label>
                <Select value={editingMethod?.integration_type || 'none'} onValueChange={(v) => setEditingMethod(prev => prev ? { ...prev, integration_type: v } : null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="tef_pinpad">TEF PinPad (WebService)</SelectItem>
                    <SelectItem value="tef_smartpos">TEF SmartPOS (PINPDV)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Ao selecionar esta forma no PDV, o TEF será acionado automaticamente</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
