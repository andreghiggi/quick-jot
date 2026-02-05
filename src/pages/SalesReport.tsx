import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, Package, TrendingUp, Calendar, DollarSign, ShoppingCart, Loader2 } from 'lucide-react';

type PeriodType = 'today' | 'week' | 'month' | 'last_month';

interface SaleItem {
  product_name: string;
  quantity: number;
  total_price: number;
}

interface SaleData {
  id: string;
  created_at: string;
  final_total: number;
  items: SaleItem[];
}

function getPeriodDates(period: PeriodType) {
  const now = new Date();
  
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), label: 'Hoje' };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }), label: 'Esta Semana' };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now), label: 'Este Mês' };
    case 'last_month':
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth), label: 'Mês Anterior' };
    default:
      return { start: startOfDay(now), end: endOfDay(now), label: 'Hoje' };
  }
}

export default function SalesReport() {
  const { company } = useAuthContext();
  const [period, setPeriod] = useState<PeriodType>('today');
  const [productFilter, setProductFilter] = useState<string>('all');

  const periodDates = useMemo(() => getPeriodDates(period), [period]);

  // Fetch sales data
  const { data: salesData, isLoading: loadingSales } = useQuery({
    queryKey: ['sales-report', company?.id, period],
    queryFn: async () => {
      if (!company?.id) return [];
      
      const { data: sales, error } = await supabase
        .from('pdv_sales')
        .select('id, created_at, final_total')
        .eq('company_id', company.id)
        .gte('created_at', periodDates.start.toISOString())
        .lte('created_at', periodDates.end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch items for each sale
      const salesWithItems: SaleData[] = [];
      for (const sale of sales || []) {
        const { data: items } = await supabase
          .from('pdv_sale_items')
          .select('product_name, quantity, total_price')
          .eq('sale_id', sale.id);
        
        salesWithItems.push({
          ...sale,
          items: items || []
        });
      }
      
      return salesWithItems;
    },
    enabled: !!company?.id
  });

  // Get unique products from sales
  const uniqueProducts = useMemo(() => {
    if (!salesData) return [];
    const products = new Set<string>();
    salesData.forEach(sale => {
      sale.items.forEach(item => products.add(item.product_name));
    });
    return Array.from(products).sort();
  }, [salesData]);

  // Calculate report data
  const reportData = useMemo(() => {
    if (!salesData) return { totalSales: 0, totalRevenue: 0, productsSold: [] as { name: string; quantity: number; total: number }[], totalProducts: 0 };

    let filteredSales = salesData;
    
    // Filter by product if selected
    if (productFilter !== 'all') {
      filteredSales = salesData.filter(sale => 
        sale.items.some(item => item.product_name === productFilter)
      );
    }

    const totalSales = filteredSales.length;
    const totalRevenue = filteredSales.reduce((sum, sale) => {
      if (productFilter === 'all') {
        return sum + sale.final_total;
      }
      // If filtering by product, only count that product's revenue
      const productTotal = sale.items
        .filter(item => item.product_name === productFilter)
        .reduce((s, item) => s + item.total_price, 0);
      return sum + productTotal;
    }, 0);

    // Products sold summary
    const productsMap: Record<string, { quantity: number; total: number }> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (productFilter === 'all' || item.product_name === productFilter) {
          if (!productsMap[item.product_name]) {
            productsMap[item.product_name] = { quantity: 0, total: 0 };
          }
          productsMap[item.product_name].quantity += item.quantity;
          productsMap[item.product_name].total += item.total_price;
        }
      });
    });

    const productsSold = Object.entries(productsMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);

    const totalProducts = productsSold.reduce((sum, p) => sum + p.quantity, 0);

    return { totalSales, totalRevenue, productsSold, totalProducts };
  }, [salesData, productFilter]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Relatório de Vendas
            </h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe as vendas da sua empresa
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Período
                </label>
                <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="week">Esta Semana</SelectItem>
                    <SelectItem value="month">Este Mês</SelectItem>
                    <SelectItem value="last_month">Mês Anterior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Produto
                </label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os produtos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Produtos</SelectItem>
                    {uniqueProducts.map(product => (
                      <SelectItem key={product} value={product}>{product}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Período: {format(periodDates.start, "dd/MM/yyyy", { locale: ptBR })} - {format(periodDates.end, "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </CardContent>
        </Card>

        {loadingSales ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total de Vendas</p>
                      <p className="text-3xl font-bold text-foreground">{reportData.totalSales}</p>
                    </div>
                    <div className="p-3 rounded-full bg-primary/10">
                      <ShoppingCart className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Faturamento</p>
                      <p className="text-3xl font-bold text-foreground">
                        R$ {reportData.totalRevenue.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-success/10">
                      <DollarSign className="h-6 w-6 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Produtos Vendidos</p>
                      <p className="text-3xl font-bold text-foreground">
                        {reportData.totalProducts}
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-accent">
                      <Package className="h-6 w-6 text-accent-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Products Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Vendas por Produto
                </CardTitle>
                <CardDescription>
                  Detalhamento das vendas por produto no período selecionado
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.productsSold.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma venda encontrada no período selecionado
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-center">Quantidade</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.productsSold.map((product, index) => (
                        <TableRow key={product.name}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">#{index + 1}</span>
                              {product.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{product.quantity}</TableCell>
                          <TableCell className="text-right font-medium">
                            R$ {product.total.toFixed(2).replace('.', ',')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
