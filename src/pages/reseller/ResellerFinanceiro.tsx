import { useState, useEffect } from 'react';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, Clock, FileText, Eye, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StoreDetailDialog, StoreDetail } from '@/components/reseller/StoreDetailDialog';

interface CompanyRow {
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
}

interface InvoiceRow {
  id: string;
  company_id: string;
  month: string;
  due_date: string;
  total_value: number;
  status: string;
  paid_at: string | null;
}

export default function ResellerFinanceiro() {
  const { reseller, settings, stats, loading } = useResellerPortal();
  const { isSuperAdmin } = useAuthContext();
  const canEdit = isSuperAdmin();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedStore, setSelectedStore] = useState<StoreDetail | null>(null);

  useEffect(() => {
    if (!reseller) return;
    void fetchData();
  }, [reseller]);

  async function fetchData() {
    if (!reseller) return;
    setLoadingData(true);

    const [companiesRes, invoicesRes] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, cnpj, phone, login_email, active, address_street, address_number, address_neighborhood, reseller_id')
        .eq('reseller_id', reseller.id)
        .order('name'),
      supabase
        .from('reseller_invoices')
        .select('id, company_id, month, due_date, total_value, status, paid_at')
        .eq('reseller_id', reseller.id)
        .order('due_date', { ascending: false }),
    ]);

    setCompanies((companiesRes.data as any[]) || []);
    setInvoices((invoicesRes.data as any[]) || []);
    setLoadingData(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Aggregate per store
  const storeRows = companies.map(c => {
    const myInvoices = invoices.filter(i => i.company_id === c.id);
    const open = myInvoices.filter(i => i.status === 'pending' || i.status === 'overdue');
    const totalOpen = open.reduce((s, i) => s + Number(i.total_value), 0);
    const lastOpen = open.sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    let storeStatus: 'paid' | 'pending' | 'overdue' | 'blocked' = 'paid';
    if (lastOpen) {
      const due = new Date(lastOpen.due_date + 'T12:00:00');
      const diffDays = (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) storeStatus = 'blocked';
      else if (diffDays > 0) storeStatus = 'overdue';
      else storeStatus = 'pending';
    }
    return {
      company: c,
      invoiceCount: myInvoices.length,
      totalOpen,
      nextDue: lastOpen?.due_date || null,
      storeStatus,
    };
  });

  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total_value), 0);

  const totalPending = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total_value), 0);

  const monthlyFee = settings?.monthly_fee || 29.90;
  const nextInvoiceValue = stats.totalActive * monthlyFee;
  const dueDay = settings?.invoice_due_day || 10;

  function getStoreStatusBadge(status: string) {
    switch (status) {
      case 'blocked':
        return <Badge variant="destructive">Bloqueada</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencida</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-700 border-yellow-400">Aberta</Badge>;
      default:
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Em dia</Badge>;
    }
  }

  return (
    <ResellerLayout title="Financeiro">
      <div className="space-y-6">
        {/* Summary cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Próximo Mês</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {nextInvoiceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.totalActive} loja(s) ativa(s) • venc. dia {dueDay}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Recebido</CardTitle>
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
              <CardTitle className="text-sm font-medium">Em Aberto</CardTitle>
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

        {/* Stores with invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Lojas e Mensalidades</CardTitle>
            <CardDescription>
              Cada loja tem sua própria fatura. Clique em uma linha para ver os detalhes e o histórico.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : storeRows.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-semibold">Nenhuma loja vinculada</h3>
                <p className="text-sm text-muted-foreground">
                  Vincule lojas em "Lojas" para começar a gerar mensalidades.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loja</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Próximo Vencimento</TableHead>
                      <TableHead className="text-right">Em Aberto</TableHead>
                      <TableHead className="text-center">Faturas</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeRows.map(({ company, invoiceCount, totalOpen, nextDue, storeStatus }) => (
                      <TableRow
                        key={company.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedStore(company as StoreDetail)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            {company.name}
                          </div>
                        </TableCell>
                        <TableCell>{getStoreStatusBadge(storeStatus)}</TableCell>
                        <TableCell>
                          {nextDue
                            ? format(new Date(nextDue + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {totalOpen > 0 ? (
                            <span className="text-yellow-600">
                              R$ {totalOpen.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {invoiceCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStore(company as StoreDetail);
                            }}
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <StoreDetailDialog
        store={selectedStore}
        canEdit={canEdit}
        onClose={() => {
          setSelectedStore(null);
          void fetchData();
        }}
      />
    </ResellerLayout>
  );
}
