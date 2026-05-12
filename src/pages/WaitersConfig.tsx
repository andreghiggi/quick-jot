import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useWaiters, Waiter } from '@/hooks/useWaiters';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Users, Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '');
}
function formatCpf(cpfDigits: string) {
  const d = onlyDigits(cpfDigits).padEnd(11, ' ').slice(0, 11).trim();
  if (d.length !== 11) return cpfDigits;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}
function maskCpf(cpfDigits?: string | null) {
  if (!cpfDigits) return '-';
  const d = onlyDigits(cpfDigits);
  if (d.length !== 11) return d;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

const waiterSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cpf: z.string().refine((v) => onlyDigits(v).length === 11, 'CPF deve ter 11 dígitos'),
  pin: z.string().refine((v) => /^\d{4}$/.test(v), 'PIN deve ter 4 dígitos numéricos'),
  phone: z.string().optional(),
});

const updateWaiterSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().optional(),
});

export default function WaitersConfig() {
  const { company } = useAuthContext();
  const { waiters, loading, createWaiter, updateWaiter, deleteWaiter, resetWaiterPin } = useWaiters({
    companyId: company?.id,
  });

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetPinDialogOpen, setIsResetPinDialogOpen] = useState(false);
  const [selectedWaiter, setSelectedWaiter] = useState<Waiter | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revealedCpfId, setRevealedCpfId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [resetPinValue, setResetPinValue] = useState('');

  function resetForm() {
    setFormName('');
    setFormCpf('');
    setFormPin('');
    setFormPhone('');
    setFormActive(true);
    setErrors({});
  }

  function openCreateDialog() {
    resetForm();
    setIsCreateDialogOpen(true);
  }

  function openEditDialog(waiter: Waiter) {
    setSelectedWaiter(waiter);
    setFormName(waiter.name);
    setFormPhone(waiter.phone || '');
    setFormActive(waiter.active);
    setErrors({});
    setIsEditDialogOpen(true);
  }

  function openDeleteDialog(waiter: Waiter) {
    setSelectedWaiter(waiter);
    setIsDeleteDialogOpen(true);
  }

  function openResetPinDialog(waiter: Waiter) {
    setSelectedWaiter(waiter);
    setResetPinValue('');
    setErrors({});
    setIsResetPinDialogOpen(true);
  }

  function toggleRevealCpf(id: string) {
    setRevealedCpfId((cur) => (cur === id ? null : id));
    if (revealedCpfId !== id) {
      // Auto-mask after 5s
      setTimeout(() => {
        setRevealedCpfId((cur) => (cur === id ? null : cur));
      }, 5000);
    }
  }

  async function handleCreate() {
    setErrors({});
    try {
      waiterSchema.parse({
        name: formName,
        cpf: formCpf,
        pin: formPin,
        phone: formPhone,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsSubmitting(true);
    const success = await createWaiter({
      name: formName,
      cpf: onlyDigits(formCpf),
      pin: formPin,
      phone: formPhone || undefined,
    });
    setIsSubmitting(false);

    if (success) {
      setIsCreateDialogOpen(false);
      resetForm();
    }
  }

  async function handleResetPin() {
    if (!selectedWaiter) return;
    if (!/^\d{4}$/.test(resetPinValue)) {
      setErrors({ resetPin: 'PIN deve ter 4 dígitos numéricos' });
      return;
    }
    setIsSubmitting(true);
    const ok = await resetWaiterPin(selectedWaiter.id, resetPinValue);
    setIsSubmitting(false);
    if (ok) {
      setIsResetPinDialogOpen(false);
      setSelectedWaiter(null);
      setResetPinValue('');
    }
  }

  async function handleUpdate() {
    if (!selectedWaiter) return;

    try {
      updateWaiterSchema.parse({
        name: formName,
        phone: formPhone,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsSubmitting(true);
    const success = await updateWaiter(selectedWaiter.id, {
      name: formName,
      phone: formPhone || undefined,
      active: formActive,
    });
    setIsSubmitting(false);

    if (success) {
      setIsEditDialogOpen(false);
      setSelectedWaiter(null);
    }
  }

  async function handleDelete() {
    if (!selectedWaiter) return;

    setIsSubmitting(true);
    const success = await deleteWaiter(selectedWaiter.id, selectedWaiter.user_id);
    setIsSubmitting(false);

    if (success) {
      setIsDeleteDialogOpen(false);
      setSelectedWaiter(null);
    }
  }

  if (!company) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">
          Selecione uma empresa para gerenciar garçons
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Garçons</h1>
            <p className="text-muted-foreground">
              Gerencie os garçons da empresa{' '}
              <Badge variant="outline" className="ml-2">
                {company.name}
              </Badge>
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Garçom
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Lista de Garçons
            </CardTitle>
            <CardDescription>
              Garçons cadastrados terão acesso ao sistema de mesas e comandas da empresa <strong>{company.name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : waiters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum garçom cadastrado</p>
                <p className="text-sm">Clique em "Novo Garçom" para adicionar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waiters.map((waiter) => (
                    <TableRow key={waiter.id}>
                      <TableCell className="font-medium">{waiter.name}</TableCell>
                      <TableCell>
                        {waiter.cpf ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">
                              {revealedCpfId === waiter.id ? formatCpf(waiter.cpf) : maskCpf(waiter.cpf)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleRevealCpf(waiter.id)}
                              title={revealedCpfId === waiter.id ? 'Ocultar CPF' : 'Revelar CPF'}
                            >
                              {revealedCpfId === waiter.id ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {waiter.email ? `(legado) ${waiter.email}` : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{waiter.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{company.name}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={waiter.active ? 'default' : 'secondary'}>
                          {waiter.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {waiter.cpf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openResetPinDialog(waiter)}
                              title="Resetar PIN"
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(waiter)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(waiter)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Garçom</DialogTitle>
              <DialogDescription>
                Cadastre um novo garçom. Ele entrará no sistema com o CPF e o PIN de 4 dígitos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome do garçom"
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  inputMode="numeric"
                  value={formCpf}
                  onChange={(e) => setFormCpf(formatCpf(onlyDigits(e.target.value).slice(0, 11)))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {errors.cpf && <p className="text-sm text-destructive">{errors.cpf}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (4 dígitos) *</Label>
                <Input
                  id="pin"
                  inputMode="numeric"
                  type="password"
                  autoComplete="new-password"
                  value={formPin}
                  onChange={(e) => setFormPin(onlyDigits(e.target.value).slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  className="tracking-[0.5em] text-center text-lg"
                />
                {errors.pin && <p className="text-sm text-destructive">{errors.pin}</p>}
                <p className="text-xs text-muted-foreground">
                  O garçom usará este PIN para fazer login no sistema.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cadastrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Garçom</DialogTitle>
              <DialogDescription>Atualize os dados do garçom</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome do garçom"
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-active">Ativo</Label>
                <Switch
                  id="edit-active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Garçom</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover o garçom "{selectedWaiter?.name}"? O usuário perderá
                acesso ao sistema desta empresa.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset PIN Dialog */}
        <Dialog open={isResetPinDialogOpen} onOpenChange={setIsResetPinDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Resetar PIN</DialogTitle>
              <DialogDescription>
                Defina um novo PIN de 4 dígitos para <strong>{selectedWaiter?.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="reset-pin">Novo PIN</Label>
              <Input
                id="reset-pin"
                inputMode="numeric"
                type="password"
                value={resetPinValue}
                onChange={(e) => setResetPinValue(onlyDigits(e.target.value).slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                className="tracking-[0.5em] text-center text-lg"
              />
              {errors.resetPin && <p className="text-sm text-destructive">{errors.resetPin}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResetPinDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleResetPin} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar novo PIN
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
