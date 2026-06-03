import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCoupons, type Coupon, type CouponInput, isCouponCurrentlyValid } from '@/hooks/useCoupons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Ticket, Plus, Pencil, Trash2, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

function emptyForm(): CouponInput {
  return {
    code: '',
    discount_type: 'percent',
    discount_value: 10,
    min_order_value: null,
    max_discount: null,
    is_secret: false,
    auto_apply: true,
    active: true,
    valid_from: null,
    valid_until: null,
    usage_limit: null,
  };
}

export default function CouponsPage() {
  const { company } = useAuthContext();
  const { coupons, loading, createCoupon, updateCoupon, deleteCoupon } = useCoupons(company?.id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_value: c.min_order_value,
      max_discount: c.max_discount,
      is_secret: c.is_secret,
      auto_apply: c.auto_apply,
      active: c.active,
      valid_from: c.valid_from,
      valid_until: c.valid_until,
      usage_limit: c.usage_limit,
    });
    setDialogOpen(true);
  };

  async function handleSave() {
    const code = form.code.trim().toUpperCase();
    if (!code) { toast.error('Informe o código do cupom'); return; }
    if (!/^[A-Z0-9_-]+$/.test(code)) { toast.error('Código pode ter letras, números, hífen ou underline'); return; }
    if (form.discount_value <= 0) { toast.error('Valor do desconto deve ser maior que zero'); return; }
    if (form.discount_type === 'percent' && form.discount_value > 100) { toast.error('Percentual não pode passar de 100%'); return; }
    setSubmitting(true);
    const ok = editing
      ? await updateCoupon(editing.id, { ...form, code })
      : await createCoupon({ ...form, code });
    setSubmitting(false);
    if (ok) setDialogOpen(false);
  }

  function describeDiscount(c: Coupon): string {
    if (c.discount_type === 'percent') return `${c.discount_value}% OFF`;
    return `R$ ${c.discount_value.toFixed(2).replace('.', ',')} OFF`;
  }

  function describeRule(c: Coupon): string {
    if (!c.min_order_value || c.min_order_value <= 0) return 'Válido para qualquer pedido';
    return `Acima de R$ ${c.min_order_value.toFixed(2).replace('.', ',')}`;
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Ticket className="h-6 w-6 text-primary" /> Cupons de Desconto
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crie cupons para o cardápio online. Eles serão aplicados automaticamente quando o cliente atingir as condições e ficam visíveis no topo do cardápio.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo cupom
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : coupons.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum cupom criado ainda. Clique em "Novo cupom" para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {coupons.map((c) => {
              const valid = isCouponCurrentlyValid(c);
              return (
                <Card key={c.id} className={!valid ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className="font-mono">{c.code}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary"
                            onClick={() => { navigator.clipboard.writeText(c.code); toast.success('Código copiado'); }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </CardTitle>
                        <CardDescription className="text-green-600 font-semibold mt-1">
                          {describeDiscount(c)}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {c.active ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                        {c.is_secret && <Badge variant="outline" className="text-xs">Secreto</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{describeRule(c)}</p>
                    {c.max_discount != null && (
                      <p className="text-xs text-muted-foreground">Desconto máx.: R$ {c.max_discount.toFixed(2).replace('.', ',')}</p>
                    )}
                    {c.usage_limit != null && (
                      <p className="text-xs text-muted-foreground">Usos: {c.usage_count}/{c.usage_limit}</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cupom' : 'Novo cupom'}</DialogTitle>
            <DialogDescription>
              Defina o código, o desconto e as regras. Se "Valor mínimo do pedido" ficar em branco, o cupom vale para o cardápio inteiro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="code">Código*</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="EX: BEMVINDO10"
                className="font-mono uppercase"
                maxLength={32}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de desconto*</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as 'percent' | 'fixed' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="discount_value">{form.discount_type === 'percent' ? 'Percentual*' : 'Valor (R$)*'}</Label>
                <Input
                  id="discount_value"
                  type="number"
                  step={form.discount_type === 'percent' ? '1' : '0.01'}
                  min="0"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="min_order">Valor mínimo do pedido (R$)</Label>
                <Input
                  id="min_order"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Em branco = cardápio todo"
                  value={form.min_order_value ?? ''}
                  onChange={(e) => setForm({ ...form, min_order_value: e.target.value === '' ? null : parseFloat(e.target.value) })}
                />
              </div>
              {form.discount_type === 'percent' && (
                <div>
                  <Label htmlFor="max_discount">Desconto máximo (R$)</Label>
                  <Input
                    id="max_discount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional"
                    value={form.max_discount ?? ''}
                    onChange={(e) => setForm({ ...form, max_discount: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="valid_from">Válido a partir de</Label>
                <Input
                  id="valid_from"
                  type="datetime-local"
                  value={form.valid_from ? form.valid_from.slice(0, 16) : ''}
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div>
                <Label htmlFor="valid_until">Válido até</Label>
                <Input
                  id="valid_until"
                  type="datetime-local"
                  value={form.valid_until ? form.valid_until.slice(0, 16) : ''}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="usage_limit">Limite total de usos</Label>
              <Input
                id="usage_limit"
                type="number"
                min="1"
                placeholder="Em branco = ilimitado"
                value={form.usage_limit ?? ''}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="is_secret" className="cursor-pointer">Cupom secreto</Label>
                <p className="text-xs text-muted-foreground">Não aparece no banner do cardápio. Só funciona quando o cliente digita o código.</p>
              </div>
              <Switch
                id="is_secret"
                checked={form.is_secret}
                onCheckedChange={(v) => setForm({ ...form, is_secret: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="auto_apply" className="cursor-pointer">Aplicar automaticamente</Label>
                <p className="text-xs text-muted-foreground">Quando ligado, o cupom é aplicado sozinho no carrinho ao atingir as condições. Quando desligado, o cliente precisa copiar o código no banner e colar no fechamento do pedido.</p>
              </div>
              <Switch
                id="auto_apply"
                checked={form.auto_apply}
                onCheckedChange={(v) => setForm({ ...form, auto_apply: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="active" className="cursor-pointer">Ativo</Label>
                <p className="text-xs text-muted-foreground">Cupons inativos não aparecem no cardápio nem podem ser aplicados.</p>
              </div>
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Salvar' : 'Criar cupom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (deleteId) { await deleteCoupon(deleteId); setDeleteId(null); } }}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}