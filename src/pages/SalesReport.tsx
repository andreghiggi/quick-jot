import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, Package, TrendingUp, Calendar as CalendarIcon, DollarSign, ShoppingCart, Loader2, Filter, Receipt } from 'lucide-react';

type PeriodType = 'today' | 'week' | 'month' | 'last_month' | 'custom';

type OriginKey = 'balcao' | 'delivery' | 'retirada' | 'mesa' | 'mesa_qr';

const ORIGIN_OPTIONS: { key: OriginKey; label: string; badgeClass: string }[] = [
  { key: 'balcao',   label: 'Balcão / PDV',   badgeClass: 'bg-muted text-muted-foreground border-transparent' },
  { key: 'delivery', label: 'Delivery',       badgeClass: 'bg-blue-100 text-blue-700 border-transparent dark:bg-blue-500/15 dark:text-blue-300' },
  { key: 'retirada', label: 'Retirada',       badgeClass: 'bg-amber-100 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300' },
  { key: 'mesa',     label: 'Mesa (Garçom)',  badgeClass: 'bg-purple-100 text-purple-700 border-transparent dark:bg-purple-500/15 dark:text-purple-300' },
  { key: 'mesa_qr',  label: 'Mesa QR',        badgeClass: 'bg-purple-100 text-purple-700 border-transparent dark:bg-purple-500/15 dark:text-purple-300' },
];

const ALL_ORIGINS: OriginKey[] = ORIGIN_OPTIONS.map(o => o.key);

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
  origin: OriginKey;
  table_number?: string | null;
  short_code?: string | null;
}

function getPeriodDates(period: PeriodType, customStart?: Date, customEnd?: Date) {
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
    case 'custom':
      return {
        start: startOfDay(customStart ?? now),
        end: endOfDay(customEnd ?? customStart ?? now),
        label: 'Personalizado',
      };
    default:
      return { start: startOfDay(now), end: endOfDay(now), label: 'Hoje' };
  }
}

export default function SalesReport() {
  const { company } = useAuthContext();
  const [period, setPeriod] = useState<PeriodType>('week');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [selectedOrigins, setSelectedOrigins] = useState<OriginKey[]>(ALL_ORIGINS);
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const periodDates = useMemo(
    () => getPeriodDates(period, customRange.from, customRange.to),
    [period, customRange.from, customRange.to]
  );

  // Fetch sales data: PDV sales + delivered orders
  const { data: salesData, isLoading: loadingSales } = useQuery({
    queryKey: ['sales-report', company?.id, periodDates.start.toISOString(), periodDates.end.toISOString()],
    queryFn: async () => {
      if (!company?.id) return [];
      
      // 1. Fetch PDV sales
      const { data: pdvSales, error: pdvError } = await supabase
        .from('pdv_sales')
        .select('id, created_at, final_total, customer_name, notes')
        .eq('company_id', company.id)
        .gte('created_at', periodDates.start.toISOString())
        .lte('created_at', periodDates.end.toISOString())
        .order('created_at', { ascending: false });

      if (pdvError) {
        console.error('Error fetching pdv sales:', pdvError);
      }

      // 2. Fetch delivered orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, created_at, total, origin, delivery_address, short_code')
        .eq('company_id', company.id)
        .eq('status', 'delivered')
        .gte('created_at', periodDates.start.toISOString())
        .lte('created_at', periodDates.end.toISOString())
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      }

      const allSaleEntries: {
        id: string;
        created_at: string;
        final_total: number;
        source: 'pdv' | 'order';
        origin: OriginKey;
        table_number?: string | null;
        short_code?: string | null;
      }[] = [];

      (pdvSales || []).forEach((s: any) => {
        const customerName = String(s.customer_name || '');
        const notes = String(s.notes || '');
        const isComanda = notes.includes('Comanda #') || customerName.startsWith('Mesa ');
        const tableMatch = customerName.match(/Mesa\s+(\d+)/i);
        const tabMatch = notes.match(/Comanda\s+#?(\d+)/i);

        allSaleEntries.push({
          id: s.id,
          created_at: s.created_at,
          final_total: s.final_total,
          source: 'pdv',
          origin: isComanda ? (customerName.includes('(QR)') ? 'mesa_qr' : 'mesa') : 'balcao',
          table_number: tableMatch?.[1] ?? null,
          short_code: tabMatch?.[1] ? `Comanda ${tabMatch[1]}` : null,
        });
      });

      (orders || []).forEach((o: any) => {
        let originBucket: OriginKey = 'balcao';
        const rawOrigin = (o.origin || '').toString();
        if (rawOrigin === 'mesa') originBucket = 'mesa';
        else if (rawOrigin === 'mesa_qr') originBucket = 'mesa_qr';
        else if (rawOrigin === 'balcao') originBucket = 'balcao';
        else if (rawOrigin === 'cardapio') {
          originBucket = (o.delivery_address && String(o.delivery_address).trim().length > 0) ? 'delivery' : 'retirada';
        }
        allSaleEntries.push({
          id: o.id,
          created_at: o.created_at,
          final_total: o.total,
          source: 'order',
          origin: originBucket,
          table_number: null,
          short_code: o.short_code ?? null,
        });
      });

      if (allSaleEntries.length === 0) return [];

      // Fetch PDV sale items
      const pdvIds = allSaleEntries.filter(s => s.source === 'pdv').map(s => s.id);
      const orderIds = allSaleEntries.filter(s => s.source === 'order').map(s => s.id);

      let pdvItems: any[] = [];
      let orderItems: any[] = [];

      if (pdvIds.length > 0) {
        const { data } = await supabase
          .from('pdv_sale_items')
          .select('sale_id, product_name, quantity, total_price')
          .in('sale_id', pdvIds);
        pdvItems = data || [];
      }

      if (orderIds.length > 0) {
        const { data } = await supabase
          .from('order_items')
          .select('order_id, name, quantity, price')
          .in('order_id', orderIds);
        orderItems = data || [];
      }

      // Build items map
      const itemsBySaleId: Record<string, SaleItem[]> = {};

      pdvItems.forEach(item => {
        if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
        itemsBySaleId[item.sale_id].push({
          product_name: item.product_name,
          quantity: item.quantity,
          total_price: item.total_price,
        });
      });

      orderItems.forEach(item => {
        if (!itemsBySaleId[item.order_id]) itemsBySaleId[item.order_id] = [];
        itemsBySaleId[item.order_id].push({
          product_name: item.name,
          quantity: item.quantity,
          total_price: item.price * item.quantity,
        });
      });

      tabItems.forEach(item => {
        if (!itemsBySaleId[item.tab_id]) itemsBySaleId[item.tab_id] = [];
        itemsBySaleId[item.tab_id].push({
          product_name: item.product_name,
          quantity: Number(item.quantity || 0),
          total_price: Number(item.total_price || 0),
        });
      });

      const salesWithItems: SaleData[] = allSaleEntries
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(sale => {
          const items = itemsBySaleId[sale.id] || [];
          return {
            id: sale.id,
            created_at: sale.created_at,
            final_total: sale.source === 'tab'
              ? items.reduce((sum, item) => sum + item.total_price, 0)
              : sale.final_total,
            items,
            origin: sale.origin,
            table_number: sale.table_number,
            short_code: sale.short_code,
          };
        });
      
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

    // Filter by origin first
    let filteredSales = salesData.filter(s => selectedOrigins.includes(s.origin));

    // Filter by product if selected
    if (productFilter !== 'all') {
      filteredSales = filteredSales.filter(sale =>
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
  }, [salesData, productFilter, selectedOrigins]);

  // Individual sales list (respecting filters), for the per-sale breakdown card
  const filteredSalesList = useMemo(() => {
    if (!salesData) return [] as SaleData[];
    let list = salesData.filter(s => selectedOrigins.includes(s.origin));
    if (productFilter !== 'all') {
      list = list.filter(sale => sale.items.some(item => item.product_name === productFilter));
    }
    return list;
  }, [salesData, productFilter, selectedOrigins]);

  const toggleOrigin = (key: OriginKey) => {
    setSelectedOrigins(prev =>
      prev.includes(key) ? prev.filter(o => o !== key) : [...prev, key]
    );
  };

  const originLabel = (key: OriginKey) => ORIGIN_OPTIONS.find(o => o.key === key)?.label ?? key;
  const originBadgeClass = (key: OriginKey) => ORIGIN_OPTIONS.find(o => o.key === key)?.badgeClass ?? '';

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
              <CalendarIcon className="h-5 w-5" />
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
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {period === 'custom' && (
                  <div className="mt-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customRange.from
                            ? customRange.to
                              ? `${format(customRange.from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(customRange.to, 'dd/MM/yyyy', { locale: ptBR })}`
                              : format(customRange.from, 'dd/MM/yyyy', { locale: ptBR })
                            : 'Selecione as datas'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={{ from: customRange.from, to: customRange.to }}
                          onSelect={(r: any) => setCustomRange({ from: r?.from, to: r?.to })}
                          numberOfMonths={2}
                          locale={ptBR}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Origem
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      <span className="flex items-center gap-2 truncate">
                        <Filter className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {selectedOrigins.length === ALL_ORIGINS.length
                            ? 'Todas as origens'
                            : selectedOrigins.length === 0
                              ? 'Nenhuma selecionada'
                              : `${selectedOrigins.length} selecionada(s)`}
                        </span>
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Filtrar por origem</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {ORIGIN_OPTIONS.map(opt => (
                      <DropdownMenuCheckboxItem
                        key={opt.key}
                        checked={selectedOrigins.includes(opt.key)}
                        onCheckedChange={() => toggleOrigin(opt.key)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {opt.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={selectedOrigins.length === ALL_ORIGINS.length}
                      onCheckedChange={(v) => setSelectedOrigins(v ? ALL_ORIGINS : [])}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Selecionar todas
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

            {/* Per-sale list with origin badges */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Vendas no Período
                </CardTitle>
                <CardDescription>
                  Cada venda do período, com a origem identificada
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredSalesList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma venda encontrada com os filtros atuais
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Identificação</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSalesList.map(sale => {
                        const isMesa = sale.origin === 'mesa' || sale.origin === 'mesa_qr';
                        const ident = sale.short_code
                          ? sale.short_code
                          : `#${sale.id.slice(0, 6).toUpperCase()}`;
                        return (
                          <TableRow key={sale.id}>
                            <TableCell className="font-medium">{ident}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={originBadgeClass(sale.origin)}>
                                {isMesa
                                  ? `${originLabel(sale.origin)}${sale.table_number ? ` ${sale.table_number}` : ''}`
                                  : originLabel(sale.origin)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(sale.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right font-medium text-success">
                              R$ {Number(sale.final_total || 0).toFixed(2).replace('.', ',')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
