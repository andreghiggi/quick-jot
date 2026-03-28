import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  CreditCard,
  Loader2,
  GripVertical
} from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentMethods() {
  const { company } = useAuthContext();
  const { paymentMethods, loading, addPaymentMethod, updatePaymentMethod, deletePaymentMethod } = usePaymentMethods({ 
    companyId: company?.id 
  });

  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');
  const [editingMethod, setEditingMethod] = useState<{ id: string; name: string } | null>(null);
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAdd() {
    if (!newMethodName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSubmitting(true);
    const success = await addPaymentMethod(newMethodName.trim());
    setIsSubmitting(false);

    if (success) {
      setAddDialog(false);
      setNewMethodName('');
    }
  }

  async function handleEdit() {
    if (!editingMethod || !editingMethod.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSubmitting(true);
    const success = await updatePaymentMethod(editingMethod.id, { name: editingMethod.name.trim() });
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

  function openEditDialog(method: { id: string; name: string }) {
    setEditingMethod({ ...method });
    setEditDialog(true);
  }

  function openDeleteDialog(id: string) {
    setDeletingMethodId(id);
    setDeleteDialog(true);
  }

  const headerActions = (
    <Button onClick={() => setAddDialog(true)} className="gap-2">
      <Plus className="w-4 h-4" />
      <span className="hidden sm:inline">Nova Forma</span>
    </Button>
  );

  if (loading) {
    return (
      <AppLayout title="Formas de Pagamento">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Formas de Pagamento" actions={headerActions}>
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Formas de Pagamento
            </CardTitle>
            <CardDescription>
              Configure as formas de pagamento do seu estabelecimento (cardápio e PDV)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentMethods.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Nenhuma forma de pagamento cadastrada</p>
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
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <CreditCard className="w-5 h-5 text-primary" />
                      <span className="font-medium">{method.name}</span>
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
                    onClick={() => addPaymentMethod(name)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Forma de Pagamento</DialogTitle>
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
    </AppLayout>
  );
}
