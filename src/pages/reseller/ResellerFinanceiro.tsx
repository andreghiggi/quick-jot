import { useState, useEffect } from 'react';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, Clock, AlertCircle, FileText, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { getMonthLabel } from '@/services/resellerBilling';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { InvoiceEditDialog, InvoiceForEdit, InvoiceItemRow } from '@/components/reseller/InvoiceEditDialog';

interface Invoice {
  id: string;
  reseller_id: string;
  month: string;
  due_date: string;
  total_value: number;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  company_id: string | null;
  company_name: string;
  type: string;
  value: number;
  days_counted: number | null;
}

export default function ResellerFinanceiro() {
  const { reseller, settings, stats, loading } = useResellerPortal();
  const { isSuperAdmin } = useAuthContext();
  const canEdit = isSuperAdmin();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<Record<string, InvoiceItem[]>>({});
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceForEdit | null>(null);
  const [editingItems, setEditingItems] = useState<InvoiceItemRow[]>([]);

  useEffect(() => {
    if (!reseller) return;
    fetchInvoices();
  }, [reseller]);

  async function fetchInvoices() {
    if (!reseller) return;
    setLoadingInvoices(true);
    const { data } = await supabase
      .from('reseller_invoices')
      .select('*')
      .eq('reseller_id', reseller.id)
      .order('month', { ascending: false });

    setInvoices((data as any[]) || []);
    setLoadingInvoices(false);
  }

  async function fetchItems(invoiceId: string) {
    if (invoiceItems[invoiceId]) {
      setExpandedInvoice(expandedInvoice === invoiceId ? null : invoiceId);
      return;
    }
    const { data } = await supabase
      .from('reseller_invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId);

    setInvoiceItems(prev => ({ ...prev, [invoiceId]: (data as any[]) || [] }));
    setExpandedInvoice(invoiceId);
  }

  async function openEdit(invoice: Invoice) {
    const { data } = await supabase
      .from('reseller_invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);
    setEditingItems((data as any[]) || []);
    setEditingInvoice(invoice as InvoiceForEdit);
  }

  async function handleSaved() {
    // Refresh invoice list and any expanded items
    await fetchInvoices();
    if (editingInvoice) {
      const { data } = await supabase
        .from('reseller_invoice_items')
        .select('*')
        .eq('invoice_id', editingInvoice.id);
      setInvoiceItems(prev => ({ ...prev, [editingInvoice.id]: (data as any[]) || [] }));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const monthlyFee = settings?.monthly_fee || 29.90;
  const activeCount = stats.totalActive;
  const nextInvoiceValue = activeCount * monthlyFee;
  const dueDay = settings?.invoice_due_day || 10;

  const now = new Date();
  let nextDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (nextDueDate <= now) {
    nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  }

  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total_value), 0);

  const totalPending = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total_value), 0);

  const hasIntegration = !!settings?.asaas_api_key;

  function getStatusBadge(status: string) {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Pago</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencido</Badge>;
      default:
        return <Badge variant="outline" className="text-yellow-700 border-yellow-400">Pendente</Badge>;
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'activation': return 'Taxa de Ativação';
      case 'monthly': return 'Mensalidade';
      case 'prorated': return 'Proporcional';
      default: return type;
    }
  }

  return (
    <ResellerLayout title="Financeiro">
      <div className="space-y-6">
        {/* Summary cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Próxima Fatura</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {nextInvoiceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                Vencimento: dia {dueDay}/{String(nextDueDate.getMonth() + 1).padStart(2, '0')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
              <DollarSign className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                {invoices.filter(i => i.status === 'paid').length} fatura(s) paga(s)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
              <Clock className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                R$ {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                {invoices.filter(i => i.status !== 'paid').length} fatura(s) pendente(s)
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Faturas</CardTitle>
            <CardDescription>Histórico de cobranças e pagamentos</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold">Nenhuma fatura</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                    As faturas serão geradas automaticamente no início de cada mês com base nas lojas ativas.
                  </p>
                </div>
                {!hasIntegration && (
                  <Badge variant="outline" className="text-sm">
                    Integração Asaas • Em breve
                  </Badge>
                )}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-right">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(invoice => (
                      <>
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            {getMonthLabel(invoice.month)}
                          </TableCell>
                          <TableCell>
                            {format(new Date(invoice.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            R$ {Number(invoice.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {invoice.paid_at
                              ? format(new Date(invoice.paid_at), "dd/MM/yyyy", { locale: ptBR })
                              : hasIntegration
                                ? <Button size="sm" variant="outline" disabled>Pagar via PIX</Button>
                                : <span className="text-xs text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEdit(invoice)}
                                  title="Editar fatura"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => fetchItems(invoice.id)}
                              >
                                {expandedInvoice === invoice.id ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedInvoice === invoice.id && invoiceItems[invoice.id] && (
                          <TableRow key={`${invoice.id}-items`}>
                            <TableCell colSpan={6} className="bg-muted/50 p-0">
                              <div className="px-6 py-3">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Itens da fatura</p>
                                <div className="space-y-1">
                                  {invoiceItems[invoice.id].map(item => (
                                    <div key={item.id} className="flex justify-between text-sm">
                                      <span>
                                        {item.company_name} — {getTypeLabel(item.type)}
                                        {item.days_counted ? ` (${item.days_counted} dias)` : ''}
                                      </span>
                                      <span className="font-medium">
                                        R$ {Number(item.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ResellerLayout>
  );
}
