import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OrderDetailDialog } from '@/components/OrderDetailDialog';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Users,
  Search,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  DollarSign,
  ShoppingCart,
  Loader2,
  X,
  ArrowUp,
  ArrowDown,
  TrendingUp,
} from 'lucide-react';

interface OrderRow {
  id: string;
  order_code: string;
  created_at: string;
  status: string;
  total: number;
  daily_number: number | null;
}

interface CustomerData {
  name: string;
  phone: string | null;
  address: string | null;
  birthDate: string | null;
  firstDate: string;
  lastDate: string;
  totalOrders: number;
  totalSpent: number;
  totalProductRevenue: number;
  orders: OrderRow[];
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  delivered: 'bg-muted text-muted-foreground',
};

export default function CustomerReport() {
  const { company } = useAuthContext();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'totalOrders' | 'totalSpent' | 'lastDate'>('lastDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['customer-report-orders', company?.id],
    queryFn: async () => {
      if (!company?.id) return { orders: [], allCustomers: [] };

      // Helper para paginar consultas (Supabase limita a 1000 linhas por requisição)
      const fetchAll = async <T,>(
        build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
      ): Promise<T[]> => {
        const pageSize = 30;
        let from = 0;
        const all: T[] = [];
        while (true) {
          const { data, error } = await build(from, from + pageSize - 1);
          if (error) throw error;
          const rows = data || [];
          all.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const [orders, items, customersData] = await Promise.all([
        fetchAll<any>((from, to) =>
          supabase
            .from('orders')
            .select('id, order_code, customer_name, customer_phone, delivery_address, created_at, status, total, daily_number')
            .eq('company_id', company.id)
            .order('created_at', { ascending: false })
            .range(from, to)
        ),
        fetchAll<any>((from, to) =>
          supabase
            .from('order_items')
            .select('order_id, price, quantity')
            .eq('company_id', company.id)
            .range(from, to)
        ),
        fetchAll<any>((from, to) =>
          supabase
            .from('customers')
            .select('name, phone, address, birth_date, created_at')
            .eq('company_id', company.id)
            .range(from, to)
        ),
      ]);

      const ordersRes = { data: orders, error: null };
      const itemsRes = { data: items, error: null };
      const customersRes = { data: customersData, error: null };
      if (ordersRes.error) throw ordersRes.error;
      const subtotalMap = new Map<string, number>();
      for (const item of (itemsRes.data || [])) {
        subtotalMap.set(item.order_id, (subtotalMap.get(item.order_id) || 0) + Number(item.price) * item.quantity);
      }
      const birthDateMap = new Map<string, string | null>();
      for (const c of (customersRes.data || [])) {
        if (c.phone) birthDateMap.set(c.phone, c.birth_date);
      }
      const enrichedOrders = (ordersRes.data || []).map(o => ({
        ...o,
        productSubtotal: subtotalMap.get(o.id) ?? Number(o.total),
        birthDate: o.customer_phone ? (birthDateMap.get(o.customer_phone) || null) : null,
      }));
      return { orders: enrichedOrders, allCustomers: customersRes.data || [] };
    },
    enabled: !!company?.id,
  });

  const orders = reportData?.orders || [];
  const allCustomers = reportData?.allCustomers || [];

  const customers = useMemo(() => {
    const map = new Map<string, CustomerData>();

    // First: add all customers from the customers table
    for (const c of allCustomers) {
      const key = (c.phone || c.name).toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          name: c.name,
          phone: c.phone || null,
          address: c.address || null,
          birthDate: c.birth_date || null,
          firstDate: c.created_at,
          lastDate: c.created_at,
          totalOrders: 0,
          totalSpent: 0,
          totalProductRevenue: 0,
          orders: [],
        });
      }
    }

    // Then: enrich with order data
    for (const o of orders) {
      const orderDate = new Date(o.created_at);
      if (dateFrom && orderDate < dateFrom) continue;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) continue;
      }

      const key = (o.customer_phone || o.customer_name).toLowerCase().trim();
      const existing = map.get(key);

      const orderRow: OrderRow = {
        id: o.id,
        order_code: o.order_code,
        created_at: o.created_at,
        status: o.status,
        total: Number(o.total),
        daily_number: o.daily_number,
      };

      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent += Number(o.total);
        existing.totalProductRevenue += o.productSubtotal;
        existing.orders.push(orderRow);
        if (o.created_at < existing.firstDate) existing.firstDate = o.created_at;
        if (o.created_at > existing.lastDate) existing.lastDate = o.created_at;
        if (!existing.address && o.delivery_address) existing.address = o.delivery_address;
        if (!existing.birthDate && o.birthDate) existing.birthDate = o.birthDate;
      } else {
        map.set(key, {
          name: o.customer_name,
          phone: o.customer_phone,
          address: o.delivery_address || null,
          birthDate: o.birthDate || null,
          firstDate: o.created_at,
          lastDate: o.created_at,
          totalOrders: 1,
          totalSpent: Number(o.total),
          totalProductRevenue: o.productSubtotal,
          orders: [orderRow],
        });
      }
    }

    return Array.from(map.values());
  }, [orders, allCustomers, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    let result = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q))
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name, 'pt-BR'); break;
        case 'totalOrders': cmp = a.totalOrders - b.totalOrders; break;
        case 'totalSpent': cmp = a.totalSpent - b.totalSpent; break;
        case 'lastDate': cmp = new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [customers, search, sortField, sortDir]);

  const totalRevenue = filtered.reduce((s, c) => s + c.totalSpent, 0);
  const totalOrders = filtered.reduce((s, c) => s + c.totalOrders, 0);
  const totalProductRevenue = filtered.reduce((s, c) => s + c.totalProductRevenue, 0);
  const avgTicket = totalOrders > 0 ? totalProductRevenue / totalOrders : 0;

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearch('');
  };

  const hasFilters = !!dateFrom || !!dateTo || !!search.trim();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório de Clientes</h1>
          <p className="text-muted-foreground">Visão completa dos clientes e seus pedidos</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Clientes</p>
                <p className="text-2xl font-bold">{filtered.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Pedidos</p>
                <p className="text-2xl font-bold">{totalOrders}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold">
                  {totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold">
                  {avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nome ou telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">De</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[150px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Até</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[150px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum cliente encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-primary">
                    <TableHead className="w-8 text-primary-foreground"></TableHead>
                    <TableHead
                      className="text-primary-foreground font-bold cursor-pointer select-none"
                      onClick={() => { if (sortField === 'name') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField('name'); setSortDir('asc'); } }}
                    >
                      <span className="flex items-center gap-1">Cliente {sortField === 'name' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                    </TableHead>
                    <TableHead className="text-primary-foreground font-bold">Telefone</TableHead>
                    <TableHead className="hidden md:table-cell text-primary-foreground font-bold">Nascimento</TableHead>
                    <TableHead className="hidden md:table-cell text-primary-foreground font-bold">Endereço</TableHead>
                    <TableHead
                      className="text-center text-primary-foreground font-bold cursor-pointer select-none"
                      onClick={() => { if (sortField === 'totalOrders') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField('totalOrders'); setSortDir('desc'); } }}
                    >
                      <span className="flex items-center justify-center gap-1">Pedidos {sortField === 'totalOrders' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                    </TableHead>
                    <TableHead
                      className="text-right text-primary-foreground font-bold cursor-pointer select-none"
                      onClick={() => { if (sortField === 'totalSpent') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField('totalSpent'); setSortDir('desc'); } }}
                    >
                      <span className="flex items-center justify-end gap-1">Total Gasto {sortField === 'totalSpent' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                    </TableHead>
                    <TableHead className="hidden lg:table-cell text-primary-foreground font-bold">Primeiro Pedido</TableHead>
                    <TableHead
                      className="hidden lg:table-cell text-primary-foreground font-bold cursor-pointer select-none"
                      onClick={() => { if (sortField === 'lastDate') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField('lastDate'); setSortDir('desc'); } }}
                    >
                      <span className="flex items-center gap-1">Último Pedido {sortField === 'lastDate' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((customer) => {
                    const key = (customer.phone || customer.name).toLowerCase().trim();
                    const isExpanded = expandedCustomer === key;
                    return (
                      <Collapsible key={key} open={isExpanded} onOpenChange={() => setExpandedCustomer(isExpanded ? null : key)} asChild>
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow className="cursor-pointer hover:bg-muted/50">
                              <TableCell>
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="font-medium">{customer.name}</TableCell>
                              <TableCell>{customer.phone || '—'}</TableCell>
                              <TableCell className="hidden md:table-cell">
                                {customer.birthDate ? (
                                  format(new Date(customer.birthDate + 'T12:00:00'), 'dd/MM/yyyy')
                                ) : (
                                  <span className="italic text-muted-foreground">Não informado</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden md:table-cell max-w-[200px] truncate">{customer.address || '—'}</TableCell>
                              <TableCell className="text-center">{customer.totalOrders}</TableCell>
                              <TableCell className="text-right font-medium">
                                {customer.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {format(new Date(customer.firstDate), 'dd/MM/yyyy', { locale: ptBR })}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {format(new Date(customer.lastDate), 'dd/MM/yyyy', { locale: ptBR })}
                              </TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          <CollapsibleContent asChild>
                            <tr>
                              <td colSpan={9} className="p-0">
                                <div className="bg-muted/30 p-4 border-t">
                                  <p className="text-sm font-semibold mb-2 text-muted-foreground">Histórico de Pedidos</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Nº Pedido</TableHead>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {customer.orders
                                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                        .map((order) => (
                                          <TableRow 
                                            key={order.id} 
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => setSelectedOrderId(order.id)}
                                          >
                                             <TableCell className="font-mono text-sm">
                                               #{order.order_code}
                                             </TableCell>
                                             <TableCell>
                                               {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                             </TableCell>
                                             <TableCell>
                                               <Badge variant="secondary" className={cn('text-xs', statusColors[order.status])}>
                                                 {statusLabels[order.status] || order.status}
                                               </Badge>
                                             </TableCell>
                                             <TableCell className="text-right font-medium">
                                               {order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                             </TableCell>
                                           </TableRow>
                                        ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </td>
                            </tr>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}
      />
    </AppLayout>
  );
}
