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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Pencil, Phone, Mail, MapPin, Calendar, Settings, Lock, FileEdit, Ban, Printer, QrCode, FolderOpen, PlusCircle, Copy } from 'lucide-react';
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
import { moduleShortLabel } from '@/lib/moduleLabels';

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

interface CompanyModule {
  module_name: string;
  created_at: string;
}

interface InvoicePaymentInfo {
  invoice_id: string;
  count: number;
  total: number;
}

interface Props {
  store: StoreDetail | null;
  canEdit: boolean;
  onClose: () => void;
}

export function StoreDetailDialog({ store, canEdit, onClose }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [modules, setModules] = useState<CompanyModule[]>([]);
  const [reseller, setReseller] = useState<{ name: string; email: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceForEdit | null>(null);
  const [editingItems, setEditingItems] = useState<InvoiceItemRow[]>([]);
  const [generatingChargeId, setGeneratingChargeId] = useState<string | null>(null);
  const [activeCharge, setActiveCharge] = useState<AsaasChargeData | null>(null);
  const [activeTab, setActiveTab] = useState<'pix' | 'boleto' | undefined>(undefined);
  const [storeData, setStoreData] = useState<StoreDetail | null>(null);
  const [showBlock, setShowBlock] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [generatingNext, setGeneratingNext] = useState(false);

  async function reloadStore(companyId: string) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, cnpj, phone, login_email, active, address_street, address_number, address_neighborhood, reseller_id, created_at, serial, license_status, license_block_reason, license_block_message, next_invoice_due_day')
      .eq('id', companyId)
      .maybeSingle();
    if (data) setStoreData(data as any);
  }

  async function handleGenerateOrShowCharge(invoice: Invoice, tab?: 'pix' | 'boleto') {
    setGeneratingChargeId(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('asaas-billing', {
        body: { action: 'create_charge', invoice_id: invoice.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao gerar cobrança');

      setActiveTab(tab);
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
    const [invRes, planRes, resellerRes, modRes] = await Promise.all([
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
      supabase
        .from('company_modules')
        .select('module_name, enabled, created_at')
        .eq('company_id', companyId)
        .eq('enabled', true)
        .order('created_at', { ascending: true }),
    ]);

    setInvoices((invRes.data as any[]) || []);
    setPlan((planRes.data as Plan) || null);
    setReseller((resellerRes.data as any) || null);
    setModules(((modRes.data as any[]) || []).map((m: any) => ({
      module_name: m.module_name,
      created_at: m.created_at,
    })));
    setSelectedInvoiceIds(new Set());
    setLoading(false);
  }

  async function handleGenerateNextInvoices() {
    if (!currentStore) return;
    setGeneratingNext(true);
    try {
      const { data, error } = await supabase.functions.invoke('reseller-billing', {
        body: {
          action: 'backfill_invoices',
          reseller_id: currentStore.reseller_id,
          company_id: currentStore.id,
        },
      });
      if (error) throw error;
      const created = (data as any)?.created_count ?? (data as any)?.created ?? 0;
      if (created > 0) toast.success(`${created} mensalidade(s) gerada(s).`);
      else toast.info('Nenhuma mensalidade nova para gerar — já está em dia.');
      await loadData(currentStore.id);
    } catch (err: any) {
      toast.error('Erro ao gerar mensalidades: ' + (err.message || 'falha'));
    } finally {
      setGeneratingNext(false);
    }
  }

  function toggleInvoice(id: string) {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

  const licenseStatusPill = (() => {
    if (isCanceled) return <Badge variant="destructive">Cancelada</Badge>;
    if (isManuallyBlocked) return <Badge variant="destructive">Travada</Badge>;
    if (isSuspended) return <Badge variant="destructive">Bloqueada</Badge>;
    if (currentStore?.active === false) return <Badge variant="outline">Inativa</Badge>;
    return <Badge className="bg-green-600 hover:bg-green-600 text-white">Liberado</Badge>;
  })();

  function copySerial() {
    if (!currentStore?.serial) return;
    navigator.clipboard.writeText(currentStore.serial);
    toast.success('Serial copiado');
  }

  function computeInvoiceCurrentValue(inv: Invoice): number {
    // Simple: paga = valor original. Aberta/vencida sem juros configurado = mesmo valor.
    return Number(inv.total_value);
  }

  return (
    <>
      <Dialog open={!!store} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-lg">{currentStore?.name || 'Detalhes da licença'}</DialogTitle>
            <DialogDescription>
              Dados da licença, cliente, adicionais contratados e mensalidades
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ============ COLUNA ESQUERDA (1/3) ============ */}
            <div className="lg:col-span-1 space-y-4">
              {/* Dados da licença + ações */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Dados da licença {currentStore?.name?.split(' ')[0] || ''}
                  </CardTitle>
                  {currentStore && !isCanceled && (
                    <div className="pt-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 uppercase font-semibold text-xs tracking-wide">
                            <Settings className="w-4 h-4" />
                            Ações da licença
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
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
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-2.5 text-sm border-t">
                  <div className="pt-3 flex items-center gap-2">
                    <span className="text-muted-foreground">Serial:</span>
                    <span className="font-mono font-semibold select-all">{currentStore?.serial || '—'}</span>
                    {currentStore?.serial && (
                      <button
                        type="button"
                        onClick={copySerial}
                        className="ml-auto text-muted-foreground hover:text-primary"
                        title="Copiar serial"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Tipo de licença:</span>
                    <span className="font-medium">Mensal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    {licenseStatusPill}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Validade:</span>
                    <span className="font-medium">
                      {licenseValidUntil ? format(licenseValidUntil, 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Qtde. licenças padrão:</span>
                    <span className="font-medium">1</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Licenças adicionais:</span>
                    <span className="font-medium">{modules.length}</span>
                  </div>
                  {isManuallyBlocked && (
                    <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-0.5">
                      <p><span className="font-semibold">Trava da revenda:</span> {currentStore?.license_block_reason || '—'}</p>
                      {currentStore?.license_block_message && (
                        <p className="text-muted-foreground">{currentStore.license_block_message}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Informações do cliente */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Informações do Cliente</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2 text-sm border-t">
                  <div className="pt-3 space-y-2">
                    <div>
                      <span className="text-muted-foreground">CNPJ: </span>
                      <span className="font-medium">{currentStore?.cnpj || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Razão: </span>
                      <span className="font-medium">{(currentStore as any)?.razao_social || currentStore?.name || '—'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="font-medium">{currentStore?.phone || '—'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="font-medium break-all">{currentStore?.login_email || '—'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <span>
                        {[
                          currentStore?.address_street,
                          currentStore?.address_number,
                          currentStore?.address_neighborhood,
                          (currentStore as any)?.address_city,
                          (currentStore as any)?.address_state,
                        ].filter(Boolean).join(', ') || '—'}
                      </span>
                    </div>
                    {canEdit && reseller && (
                      <div className="pt-2 mt-2 border-t text-xs">
                        <span className="text-muted-foreground">Revendedor: </span>
                        <span className="font-medium">{reseller.name}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ============ COLUNA DIREITA (2/3) ============ */}
            <div className="lg:col-span-2 space-y-4">
              {/* Adicionais da licença */}
              <Card>
                <Accordion type="single" collapsible defaultValue="mods">
                  <AccordionItem value="mods" className="border-0">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <span className="text-base font-semibold">Adicionais da licença</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      {modules.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic py-2">
                          Nenhum adicional contratado.
                        </p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Data de inclusão</TableHead>
                                <TableHead>Validade</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {modules.map(m => (
                                <TableRow key={m.module_name}>
                                  <TableCell className="font-medium">{moduleShortLabel(m.module_name)}</TableCell>
                                  <TableCell>
                                    {format(new Date(m.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                                  </TableCell>
                                  <TableCell>
                                    {licenseValidUntil
                                      ? format(licenseValidUntil, 'dd/MM/yyyy', { locale: ptBR })
                                      : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>

              {/* Mensalidades */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Mensalidades</CardTitle>
                  <Button
                    size="sm"
                    onClick={handleGenerateNextInvoices}
                    disabled={generatingNext || !currentStore}
                    className="gap-1.5 bg-primary hover:bg-primary/90 uppercase text-xs font-semibold tracking-wide"
                  >
                    {generatingNext ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PlusCircle className="w-4 h-4" />
                    )}
                    Gerar próximas mensalidades
                  </Button>
                </CardHeader>
                <CardContent className="pt-0 border-t">
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-6 text-center">
                      Nenhuma mensalidade gerada ainda para esta loja.
                    </p>
                  ) : (
                    <div className="rounded-md border mt-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Data vencimento</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-right">Valor atual</TableHead>
                            <TableHead className="text-center">Pagamentos</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map(inv => {
                            const isPaid = inv.status === 'paid' || inv.status === 'canceled' || inv.status === 'bonificada';
                            const isSel = selectedInvoiceIds.has(inv.id);
                            const currentVal = computeInvoiceCurrentValue(inv);
                            return (
                              <TableRow
                                key={inv.id}
                                className={isSel ? 'bg-primary/5' : undefined}
                              >
                                <TableCell>
                                  {!isPaid && (
                                    <Checkbox
                                      checked={isSel}
                                      onCheckedChange={() => toggleInvoice(inv.id)}
                                      aria-label="Selecionar fatura"
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {format(new Date(inv.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                                </TableCell>
                                <TableCell>{statusBadge(inv.status)}</TableCell>
                                <TableCell className="text-right font-medium">
                                  R$ {Number(inv.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  R$ {currentVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-center text-xs text-muted-foreground">
                                  {inv.status === 'paid' && inv.paid_at
                                    ? format(new Date(inv.paid_at), 'dd/MM/yyyy', { locale: ptBR })
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {!isPaid && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-primary hover:text-primary hover:bg-primary/10 h-8 w-8 p-0"
                                          onClick={() => handleGenerateOrShowCharge(inv, 'boleto')}
                                          disabled={generatingChargeId === inv.id}
                                          title="Abrir boleto"
                                        >
                                          {generatingChargeId === inv.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            <Printer className="w-4 h-4" />
                                          )}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-primary hover:text-primary hover:bg-primary/10 h-8 w-8 p-0"
                                          onClick={() => handleGenerateOrShowCharge(inv, 'pix')}
                                          disabled={generatingChargeId === inv.id}
                                          title="Gerar QR Code PIX"
                                        >
                                          <QrCode className="w-4 h-4" />
                                        </Button>
                                      </>
                                    )}
                                    {canEdit && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-primary hover:text-primary hover:bg-primary/10 h-8 w-8 p-0"
                                        onClick={() => openEdit(inv)}
                                        title="Editar fatura"
                                      >
                                        <FolderOpen className="w-4 h-4" />
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
                  {invoices.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 mt-4">
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
                  )}
                </CardContent>
              </Card>
            </div>
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
        defaultTab={activeTab}
        onClose={() => { setActiveCharge(null); setActiveTab(undefined); }}
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
