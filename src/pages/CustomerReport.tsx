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
  firstDate: string;
  lastDate: string;
  totalOrders: number;
  totalSpent: number;
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

  const { data: orders, isLoading } = useQuery({
    queryKey: ['customer-report-orders', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, customer_name, customer_phone, delivery_address, created_at, status, total, daily_number')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  const customers = useMemo(() => {
    if (!orders) return [];

    const map = new Map<string, CustomerData>();

    for (const o of orders) {
      // Apply date filter
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
        existing.orders.push(orderRow);
        if (o.created_at < existing.firstDate) existing.firstDate = o.created_at;
        if (o.created_at > existing.lastDate) existing.lastDate = o.created_at;
        if (!existing.address && o.delivery_address) existing.address = o.delivery_address;
      } else {
        map.set(key, {
          name: o.customer_name,
          phone: o.customer_phone,
          address: o.delivery_address || null,
          firstDate: o.created_at,
          lastDate: o.created_at,
          totalOrders: 1,
          totalSpent: Number(o.total),
          orders: [orderRow],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [customers, search]);

  const totalRevenue = filtered.reduce((s, c) => s + c.totalSpent, 0);
  const totalOrders = filtered.reduce((s, c) => s + c.totalOrders, 0);

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="hidden md:table-cell">Endereço</TableHead>
                    <TableHead className="text-center">Pedidos</TableHead>
                    <TableHead className="text-right">Total Gasto</TableHead>
                    <TableHead className="hidden lg:table-cell">Primeiro Pedido</TableHead>
                    <TableHead className="hidden lg:table-cell">Último Pedido</TableHead>
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
                              <td colSpan={8} className="p-0">
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
                                          <TableRow key={order.id}>
                                            <TableCell className="font-mono text-sm">
                                              #{order.daily_number || order.order_code}
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
    </AppLayout>
  );
}
