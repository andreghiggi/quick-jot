import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Pencil, Building2, Phone, Mail, MapPin, Calendar, Zap, ExternalLink, Briefcase, Settings, Lock, FileEdit, Ban, Printer, QrCode } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getMonthLabel } from '@/services/resellerBilling';
import { InvoiceEditDialog, InvoiceForEdit, InvoiceItemRow } from './InvoiceEditDialog';
import { AsaasPaymentDialog, AsaasChargeData } from './AsaasPaymentDialog';
import { BlockLicenseDialog } from './BlockLicenseDialog';
import { EditLicenseDialog } from './EditLicenseDialog';
import { CancelLicenseDialog } from './CancelLicenseDialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export interface StoreDetail {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  login_email: string | null;
  active: boolean;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  reseller_id: string | null;
  created_at?: string | null;
  serial?: string | null;
  license_status?: string | null;
  license_block_reason?: string | null;
  license_block_message?: string | null;
  next_invoice_due_day?: number | null;
}

interface Invoice {
  id: string;
  reseller_id: string;
  company_id: string;
  month: string;
  due_date: string;
  total_value: number;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  asaas_charge_id?: string | null;
  asaas_invoice_url?: string | null;
  asaas_pix_qrcode?: string | null;
  asaas_pix_payload?: string | null;
  asaas_boleto_url?: string | null;
}

interface Plan {
  plan_name: string;
  active: boolean;
  activated_at: string | null;
  expires_at: string | null;
  starts_at: string;
}

interface Props {
  store: StoreDetail | null;
  canEdit: boolean;
  onClose: () => void;
}

export function StoreDetailDialog({ store, canEdit, onClose }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [reseller, setReseller] = useState<{ name: string; email: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceForEdit | null>(null);
  const [editingItems, setEditingItems] = useState<InvoiceItemRow[]>([]);
  const [generatingChargeId, setGeneratingChargeId] = useState<string | null>(null);
  const [activeCharge, setActiveCharge] = useState<AsaasChargeData | null>(null);
  const [storeData, setStoreData] = useState<StoreDetail | null>(null);
  const [showBlock, setShowBlock] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  async function reloadStore(companyId: string) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, cnpj, phone, login_email, active, address_street, address_number, address_neighborhood, reseller_id, created_at, serial, license_status, license_block_reason, license_block_message, next_invoice_due_day')
      .eq('id', companyId)
      .maybeSingle();
    if (data) setStoreData(data as any);
  }

  async function handleGenerateOrShowCharge(invoice: Invoice) {
    setGeneratingChargeId(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('asaas-billing', {
        body: { action: 'create_charge', invoice_id: invoice.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao gerar cobrança');

      setActiveCharge({
        invoice_id: invoice.id,
        charge_id: data.charge_id,
        invoice_url: data.invoice_url,
        pix_qrcode: data.pix_qrcode,
        pix_payload: data.pix_payload,
        boleto_url: data.boleto_url,
        pix_error: data.pix_error,
        status: data.status,
        value: Number(invoice.total_value),
        due_date: invoice.due_date,
      });

      if (!data.already_exists) {
        toast.success('Cobrança gerada no Asaas!');
        if (store) await loadData(store.id);
      }
    } catch (err: any) {
      toast.error('Erro: ' + (err.message || 'falha ao gerar cobrança'));
    } finally {
      setGeneratingChargeId(null);
    }
  }

  useEffect(() => {
    if (!store) {
      setInvoices([]);
      setPlan(null);
      setReseller(null);
      setStoreData(null);
      return;
    }
    setStoreData(store);
    void loadData(store.id, store.reseller_id);
  }, [store?.id]);

  async function loadData(companyId: string, resellerId: string | null = store?.reseller_id ?? null) {
    setLoading(true);
    const [invRes, planRes, resellerRes] = await Promise.all([
      supabase
        .from('reseller_invoices')
        .select('*')
        .eq('company_id', companyId)
        .order('month', { ascending: false }),
      supabase
        .from('company_plans')
        .select('plan_name, active, activated_at, expires_at, starts_at')
        .eq('company_id', companyId)
        .maybeSingle(),
      resellerId
        ? supabase
            .from('resellers')
            .select('name, email')
            .eq('id', resellerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setInvoices((invRes.data as any[]) || []);
    setPlan((planRes.data as Plan) || null);
    setReseller((resellerRes.data as any) || null);
    setLoading(false);
  }

  async function openEdit(invoice: Invoice) {
    const { data } = await supabase
      .from('reseller_invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);
    setEditingItems((data as any[]) || []);
    setEditingInvoice(invoice as InvoiceForEdit);
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Paga</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencida</Badge>;
      case 'canceled':
        return <Badge variant="outline">Cancelada</Badge>;
      case 'bonificada':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Bonificada</Badge>;
      default:
        return <Badge variant="outline" className="text-yellow-700 border-yellow-400">Aberta</Badge>;
    }
  }

  const totalPaid = invoices.filter(i => i.status === 'paid' || i.status === 'bonificada').reduce((s, i) => s + Number(i.total_value), 0);
  const totalOpen = invoices.filter(i => i.status !== 'paid' && i.status !== 'canceled' && i.status !== 'bonificada').reduce((s, i) => s + Number(i.total_value), 0);

  // License validity: due date of the next open invoice + 1 month
  const licenseValidUntil = (() => {
    const open = invoices
      .filter(i => i.status !== 'paid' && i.status !== 'canceled')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const ref = open || invoices.filter(i => i.status === 'paid').sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
    if (!ref) return null;
    const d = new Date(ref.due_date + 'T12:00:00');
    d.setMonth(d.getMonth() + 1);
    return d;
  })();

  // Determine if store is suspended (has overdue invoice >3 days)
  const isSuspended = invoices.some(i => {
    if (i.status !== 'overdue' && i.status !== 'pending') return false;
    const due = new Date(i.due_date + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
    return days > 3;
  });

  const currentStore = storeData || store;
  const licenseStatus = currentStore?.license_status || 'active';
  const isManuallyBlocked = licenseStatus === 'blocked';
  const isCanceled = licenseStatus === 'canceled';

  return (
    <>
      <Dialog open={!!store} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Building2 className="w-5 h-5" />
                  {currentStore?.name}
                  {isCanceled && <Badge variant="destructive">Cancelada</Badge>}
                  {!isCanceled && isManuallyBlocked && <Badge variant="destructive">Travada pela revenda</Badge>}
                  {!isCanceled && !isManuallyBlocked && isSuspended && <Badge variant="destructive">Bloqueada</Badge>}
                  {!isCanceled && !isManuallyBlocked && currentStore?.active === false && !isSuspended && <Badge variant="outline">Inativa</Badge>}
                  {!isCanceled && !isManuallyBlocked && currentStore?.active && !isSuspended && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Ativa</Badge>}
                </DialogTitle>
                <DialogDescription>
                  Detalhes da licença e histórico de mensalidades
                </DialogDescription>
              </div>
              {currentStore && !isCanceled && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="destructive" className="gap-1.5 mr-6">
                      <Settings className="w-4 h-4" />
                      Ações da licença
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setShowBlock(true)}>
                      <Lock className="w-4 h-4 mr-2" />
                      {isManuallyBlocked ? 'Liberar acesso' : 'Trava da revenda'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowEdit(true)}>
                      <FileEdit className="w-4 h-4 mr-2" />
                      Editar licença
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowCancel(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      Cancelar licença
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </DialogHeader>

          {/* Identity / contact */}
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              {currentStore?.serial && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted border">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Serial:</span>
                  <span className="font-mono font-bold text-base tracking-wider select-all">{currentStore.serial}</span>
                  <span className="text-xs text-muted-foreground ml-auto">único e intransferível</span>
                </div>
              )}
              {isManuallyBlocked && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm space-y-0.5">
                  <p><span className="font-semibold">Trava da revenda:</span> {currentStore?.license_block_reason || '—'}</p>
                  {currentStore?.license_block_message && (
                    <p className="text-muted-foreground text-xs">{currentStore.license_block_message}</p>
                  )}
                </div>
              )}
              {canEdit && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Revendedor:</span>
                  <span className="font-semibold text-sm">
                    {reseller?.name || <span className="italic text-muted-foreground font-normal">Sem revendedor vinculado</span>}
                  </span>
                  {reseller?.email && (
                    <span className="text-xs text-muted-foreground ml-auto">{reseller.email}</span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">CNPJ:</span>
                  <span className="font-medium">{currentStore?.cnpj || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{currentStore?.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{currentStore?.login_email || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Ativada em:</span>
                  <span className="font-medium">
                    {(() => {
                      const dateStr = plan?.activated_at || plan?.starts_at || currentStore?.created_at;
                      return dateStr
                        ? format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR })
                        : '—';
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Validade da licença:</span>
                  <span className="font-medium">
                    {licenseValidUntil
                      ? format(licenseValidUntil, 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>
                    {[currentStore?.address_street, currentStore?.address_number, currentStore?.address_neighborhood]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total pago</p>
              <p className="text-lg font-bold text-green-600">
                R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Em aberto</p>
              <p className="text-lg font-bold text-yellow-600">
                R$ {totalOpen.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <Separator />

          {/* Invoice history */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Histórico de mensalidades</h4>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Nenhuma fatura ainda para esta loja.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(inv => {
                      const isPaid = inv.status === 'paid' || inv.status === 'canceled';
                      const hasCharge = !!inv.asaas_charge_id;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{getMonthLabel(inv.month)}</TableCell>
                          <TableCell>
                            {format(new Date(inv.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell>{statusBadge(inv.status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            R$ {Number(inv.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!isPaid && (
                                <Button
                                  size="sm"
                                  variant={hasCharge ? 'outline' : 'default'}
                                  onClick={() => handleGenerateOrShowCharge(inv)}
                                  disabled={generatingChargeId === inv.id}
                                  title={hasCharge ? 'Ver cobrança' : 'Gerar cobrança Asaas'}
                                >
                                  {generatingChargeId === inv.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : hasCharge ? (
                                    <ExternalLink className="w-4 h-4" />
                                  ) : (
                                    <Zap className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEdit(inv)}
                                  title="Editar fatura"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceEditDialog
        invoice={editingInvoice}
        items={editingItems}
        onClose={() => setEditingInvoice(null)}
        onSaved={() => store && loadData(store.id)}
      />

      <AsaasPaymentDialog
        charge={activeCharge}
        onClose={() => setActiveCharge(null)}
        onUpdated={() => store && loadData(store.id)}
      />

      <BlockLicenseDialog
        open={showBlock}
        onClose={() => setShowBlock(false)}
        store={currentStore as any}
        onSaved={() => currentStore && reloadStore(currentStore.id)}
      />

      <EditLicenseDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        store={currentStore as any}
        onSaved={() => currentStore && reloadStore(currentStore.id)}
      />

      <CancelLicenseDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        store={currentStore as any}
        onSaved={() => {
          if (currentStore) reloadStore(currentStore.id);
          onClose();
        }}
      />
    </>
  );
}
