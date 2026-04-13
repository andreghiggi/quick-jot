import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, Clock, AlertCircle } from 'lucide-react';

export default function ResellerFinanceiro() {
  const { companies, settings, stats, loading } = useResellerPortal();

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

  // Calculate next due date
  const now = new Date();
  let nextDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (nextDueDate <= now) {
    nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  }

  // Mock invoices placeholder (would come from Asaas integration)
  const hasIntegration = !!settings?.asaas_api_key;

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
                {hasIntegration ? 'R$ 0,00' : '--'}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasIntegration ? 'Nenhum pagamento registrado' : 'Integração pendente'}
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
                {hasIntegration ? 'R$ 0,00' : '--'}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasIntegration ? 'Nenhuma pendência' : 'Integração pendente'}
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
            {!hasIntegration ? (
              <div className="text-center py-12 space-y-4">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold">Integração Pendente</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                    O sistema de faturamento será habilitado em breve. Quando ativo, você poderá visualizar
                    boletos, pagar via PIX e acompanhar o histórico de pagamentos aqui.
                  </p>
                </div>
                <Badge variant="outline" className="text-sm">
                  API Asaas • Em breve
                </Badge>
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
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma fatura encontrada
                      </TableCell>
                    </TableRow>
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
