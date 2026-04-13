import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { OrderDateFilter } from '@/components/OrderDateFilter';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Package, FolderOpen, Layers, ArrowUpDown, ArrowUp, ArrowDown, Trophy, Crown, Star } from 'lucide-react';
import { subDays } from 'date-fns';

type QuickPeriod = 'today' | '7d' | '15d' | '30d' | 'all';
type ABCClass = 'A' | 'B' | 'C';
type SortField = 'quantity' | 'revenue';
type SortDir = 'asc' | 'desc';

interface ABCItem {
  position: number;
  name: string;
  category?: string;
  group?: string;
  quantity: number;
  revenue: number;
  percentage: number;
  classification: ABCClass;
}

function classifyABC(items: { name: string; category?: string; group?: string; quantity: number; revenue: number }[]): ABCItem[] {
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = sorted.reduce((s, i) => s + i.revenue, 0);
  if (totalRevenue === 0) return sorted.map((item, i) => ({ ...item, position: i + 1, percentage: 0, classification: 'C' as ABCClass }));

  let cumulative = 0;
  return sorted.map((item, i) => {
    const pct = (item.revenue / totalRevenue) * 100;
    cumulative += pct;
    let cls: ABCClass = 'C';
    if (cumulative <= 80) cls = 'A';
    else if (cumulative <= 95) cls = 'B';
    return { ...item, position: i + 1, percentage: pct, classification: cls };
  });
}

const abcColors: Record<ABCClass, string> = {
  A: 'bg-green-50 dark:bg-green-950/30',
  B: 'bg-yellow-50 dark:bg-yellow-950/30',
  C: 'bg-red-50 dark:bg-red-950/30',
};

const abcBadgeVariants: Record<ABCClass, string> = {
  A: 'bg-green-500 text-white hover:bg-green-600',
  B: 'bg-yellow-500 text-white hover:bg-yellow-600',
  C: 'bg-red-500 text-white hover:bg-red-600',
};

export default function ABCReport() {
  const { company } = useAuthContext();
  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(now, 30));
  const [endDate, setEndDate] = useState<Date | undefined>(now);
  const [activePeriod, setActivePeriod] = useState<QuickPeriod>('30d');

  const [visibleSections, setVisibleSections] = useState<string[]>(['products', 'categories', 'optionals']);

  const [productFilter, setProductFilter] = useState<ABCClass | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ABCClass | 'all'>('all');
  const [optionalFilter, setOptionalFilter] = useState<ABCClass | 'all'>('all');

  const [productSort, setProductSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'revenue', dir: 'desc' });
  const [categorySort, setCategorySort] = useState<{ field: SortField; dir: SortDir }>({ field: 'revenue', dir: 'desc' });
  const [optionalSort, setOptionalSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'revenue', dir: 'desc' });

  // Compute effective date range
  const effectiveStart = useMemo(() => {
    if (activePeriod === 'today') {
      const t = new Date(); t.setHours(0, 0, 0, 0); return t;
    }
    return startDate || new Date(2020, 0, 1);
  }, [activePeriod, startDate]);

  const effectiveEnd = useMemo(() => {
    if (activePeriod === 'today') return new Date();
    return endDate || new Date();
  }, [activePeriod, endDate]);

  // Fetch order items for the period
  const { data: orderItems = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['abc-order-items', company?.id, effectiveStart?.toISOString(), effectiveEnd?.toISOString()],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('name, quantity, price, order_id, product_id')
        .eq('company_id', company.id);
      if (error) throw error;

      // Filter by order date
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, created_at')
        .eq('company_id', company.id)
        .eq('status', 'delivered')
        .gte('created_at', effectiveStart.toISOString())
        .lte('created_at', effectiveEnd.toISOString());
      if (ordersErr) throw ordersErr;

      const orderIds = new Set((orders || []).map(o => o.id));
      return (data || []).filter(item => orderIds.has(item.order_id));
    },
    enabled: !!company?.id,
  });

  // Fetch PDV sale items
  const { data: pdvItems = [], isLoading: loadingPdv } = useQuery({
    queryKey: ['abc-pdv-items', company?.id, effectiveStart?.toISOString(), effectiveEnd?.toISOString()],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data: sales, error: salesErr } = await supabase
        .from('pdv_sales')
        .select('id')
        .eq('company_id', company.id)
        .gte('created_at', effectiveStart.toISOString())
        .lte('created_at', effectiveEnd.toISOString());
      if (salesErr) throw salesErr;

      const saleIds = (sales || []).map(s => s.id);
      if (saleIds.length === 0) return [];

      const { data, error } = await supabase
        .from('pdv_sale_items')
        .select('product_name, quantity, unit_price, total_price, product_id')
        .in('sale_id', saleIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Fetch products for category mapping
  const { data: products = [] } = useQuery({
    queryKey: ['abc-products', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category')
        .eq('company_id', company.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  const productCategoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { m[p.id] = p.category; m[p.name.toLowerCase()] = p.category; });
    return m;
  }, [products]);

  // Helper: strip parentheses content to get base product name
  function stripParentheses(name: string): string {
    return name.replace(/\s*\(.*?\)/g, '').trim();
  }

  // Helper: extract individual additionals from parentheses content
  // e.g. "Açaí 440ml (Acompanhamentos: Creme de leite, Leite condensado)" 
  // → ["Creme de leite", "Leite condensado"]
  function extractAdditionalsFromName(name: string): { name: string; group: string }[] {
    const results: { name: string; group: string }[] = [];
    const parenMatches = name.match(/\(([^)]+)\)/g);
    if (!parenMatches) return results;
    for (const match of parenMatches) {
      const inner = match.slice(1, -1); // remove ( )
      // Split by pipe first (separates groups), then by comma (separates items within group)
      const groups = inner.split('|');
      for (const groupStr of groups) {
        const trimmedGroup = groupStr.trim();
        const colonIdx = trimmedGroup.indexOf(':');
        const groupLabel = colonIdx >= 0 ? trimmedGroup.slice(0, colonIdx).trim() : 'Sem grupo';
        const itemsPart = colonIdx >= 0 ? trimmedGroup.slice(colonIdx + 1) : trimmedGroup;
        const items = itemsPart.split(',').map(s => {
          const cleaned = s.replace(/\s*R\$\s*\d+[.,]\d{2}/g, '').trim();
          return cleaned;
        }).filter(Boolean);
        items.forEach(item => results.push({ name: item, group: groupLabel }));
      }
    }
    return results;
  }

  // Build product ranking (strip parentheses from names)
  const productRanking = useMemo(() => {
    const map: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};

    orderItems.forEach(item => {
      const baseName = stripParentheses(item.name);
      const key = baseName.toLowerCase();
      if (!map[key]) {
        const cat = (item.product_id ? productCategoryMap[item.product_id] : productCategoryMap[key]) || 'Sem categoria';
        map[key] = { name: baseName, category: cat, quantity: 0, revenue: 0 };
      }
      map[key].quantity += item.quantity;
      map[key].revenue += item.price * item.quantity;
    });

    pdvItems.forEach(item => {
      const baseName = stripParentheses(item.product_name);
      const key = baseName.toLowerCase();
      if (!map[key]) {
        const cat = (item.product_id ? productCategoryMap[item.product_id] : productCategoryMap[key]) || 'Sem categoria';
        map[key] = { name: baseName, category: cat, quantity: 0, revenue: 0 };
      }
      map[key].quantity += item.quantity;
      map[key].revenue += item.total_price;
    });

    return classifyABC(Object.values(map));
  }, [orderItems, pdvItems, productCategoryMap]);

  // Build category ranking
  const categoryRanking = useMemo(() => {
    const map: Record<string, { name: string; quantity: number; revenue: number }> = {};

    productRanking.forEach(item => {
      const cat = item.category || 'Sem categoria';
      if (!map[cat]) map[cat] = { name: cat, quantity: 0, revenue: 0 };
      map[cat].quantity += item.quantity;
      map[cat].revenue += item.revenue;
    });

    return classifyABC(Object.values(map));
  }, [productRanking]);

  // Build optionals ranking - extract individual additionals from parentheses in order item names
  const extractedOptionals = useMemo(() => {
    const map: Record<string, { name: string; quantity: number }> = {};

    orderItems.forEach(item => {
      if (!item.name) return;
      const additionals = extractAdditionalsFromName(item.name);
      additionals.forEach(addName => {
        const key = addName.toLowerCase();
        if (!map[key]) map[key] = { name: addName, quantity: 0 };
        map[key].quantity += item.quantity;
      });
    });

    pdvItems.forEach(item => {
      if (!item.product_name) return;
      const additionals = extractAdditionalsFromName(item.product_name);
      additionals.forEach(addName => {
        const key = addName.toLowerCase();
        if (!map[key]) map[key] = { name: addName, quantity: 0 };
        map[key].quantity += item.quantity;
      });
    });

    return map;
  }, [orderItems, pdvItems]);

  // Fetch actual optional data from optional_group_items for naming
  const { data: optionalGroupItems = [] } = useQuery({
    queryKey: ['abc-optional-groups', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('optional_group_items')
        .select('id, name, price, group_id')
        .eq('company_id', company.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  const { data: optionalGroups = [] } = useQuery({
    queryKey: ['abc-optional-group-names', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('optional_groups')
        .select('id, name')
        .eq('company_id', company.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Build final optionals ranking with group info and price from catalog
  const optionalRankingFinal = useMemo(() => {
    const groupMap: Record<string, string> = {};
    optionalGroups.forEach(g => { groupMap[g.id] = g.name; });

    const optItemMap: Record<string, { groupId: string; price: number }> = {};
    optionalGroupItems.forEach(oi => { optItemMap[oi.name.toLowerCase()] = { groupId: oi.group_id, price: oi.price }; });

    const items = Object.entries(extractedOptionals).map(([key, val]) => {
      const optInfo = optItemMap[key];
      const price = optInfo?.price || 0;
      return {
        name: val.name,
        group: optInfo ? (groupMap[optInfo.groupId] || 'Sem grupo') : 'Sem grupo',
        quantity: val.quantity,
        revenue: price * val.quantity,
      };
    });

    return classifyABC(items);
  }, [extractedOptionals, optionalGroupItems, optionalGroups]);

  // Summary cards
  const topProduct = productRanking[0];
  const topCategory = categoryRanking[0];
  const topOptional = optionalRankingFinal[0];

  const isLoading = loadingOrders || loadingPdv;

  function handleClear() {
    setStartDate(undefined);
    setEndDate(undefined);
  }

  function sortItems(items: ABCItem[], sort: { field: SortField; dir: SortDir }, filter: ABCClass | 'all') {
    let filtered = filter === 'all' ? items : items.filter(i => i.classification === filter);
    filtered = [...filtered].sort((a, b) => {
      const val = sort.field === 'quantity' ? a.quantity - b.quantity : a.revenue - b.revenue;
      return sort.dir === 'asc' ? val : -val;
    });
    return filtered.map((item, i) => ({ ...item, position: i + 1 }));
  }

  function toggleSort(current: { field: SortField; dir: SortDir }, field: SortField, setter: (v: { field: SortField; dir: SortDir }) => void) {
    if (current.field === field) {
      setter({ field, dir: current.dir === 'desc' ? 'asc' : 'desc' });
    } else {
      setter({ field, dir: 'desc' });
    }
  }

  function SortIcon({ field, current }: { field: SortField; current: { field: SortField; dir: SortDir } }) {
    if (current.field !== field) return <ArrowUpDown className="w-3 h-3 ml-1 inline" />;
    return current.dir === 'desc' ? <ArrowDown className="w-3 h-3 ml-1 inline" /> : <ArrowUp className="w-3 h-3 ml-1 inline" />;
  }

  function ABCFilterButtons({ value, onChange }: { value: ABCClass | 'all'; onChange: (v: ABCClass | 'all') => void }) {
    return (
      <div className="flex gap-1.5">
        {(['all', 'A', 'B', 'C'] as const).map(v => (
          <Button
            key={v}
            size="sm"
            variant={value === v ? 'default' : 'outline'}
            className="h-7 text-xs rounded-full px-3"
            onClick={() => onChange(v)}
          >
            {v === 'all' ? 'Todos' : `Classe ${v}`}
          </Button>
        ))}
      </div>
    );
  }

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Curva ABC</h1>
          <p className="text-muted-foreground text-sm">Análise de classificação ABC de produtos, categorias e adicionais</p>
        </div>

        {/* Period filter */}
        <OrderDateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={handleClear}
          activePeriod={activePeriod}
          onPeriodChange={p => setActivePeriod(p)}
        />

        {/* Section toggles */}
        <div className="flex flex-wrap gap-2">
          <ToggleGroup
            type="multiple"
            value={visibleSections}
            onValueChange={(v) => v.length > 0 && setVisibleSections(v)}
            className="gap-2"
          >
            <ToggleGroupItem value="products" className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <Package className="w-4 h-4" /> Produtos
            </ToggleGroupItem>
            <ToggleGroupItem value="categories" className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <FolderOpen className="w-4 h-4" /> Categorias
            </ToggleGroupItem>
            <ToggleGroupItem value="optionals" className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <Layers className="w-4 h-4" /> Adicionais
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Trophy className="w-5 h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Produto mais vendido</p>
                <p className="font-semibold truncate">{topProduct?.name || '—'}</p>
                {topProduct && <p className="text-xs text-muted-foreground">{topProduct.quantity} unid.</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Crown className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Categoria mais vendida</p>
                <p className="font-semibold truncate">{topCategory?.name || '—'}</p>
                {topCategory && <p className="text-xs text-muted-foreground">{topCategory.quantity} itens</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Star className="w-5 h-5 text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Adicional mais pedido</p>
                <p className="font-semibold truncate">{topOptional?.name || '—'}</p>
                {topOptional && <p className="text-xs text-muted-foreground">{topOptional.quantity} vezes</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading && <p className="text-center text-muted-foreground py-8">Carregando dados...</p>}

        {/* Products section */}
        {!isLoading && visibleSections.includes('products') && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Package className="w-5 h-5" /> Produtos</h2>
              <ABCFilterButtons value={productFilter} onChange={setProductFilter} />
            </div>
            <div className="rounded-lg border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-600 hover:bg-red-600">
                    <TableHead className="text-white font-bold">Posição</TableHead>
                    <TableHead className="text-white font-bold">Produto</TableHead>
                    <TableHead className="text-white font-bold">Categoria</TableHead>
                    <TableHead className="text-white font-bold cursor-pointer" onClick={() => toggleSort(productSort, 'quantity', setProductSort)}>
                      Qtd Vendida <SortIcon field="quantity" current={productSort} />
                    </TableHead>
                    <TableHead className="text-white font-bold cursor-pointer" onClick={() => toggleSort(productSort, 'revenue', setProductSort)}>
                      Receita <SortIcon field="revenue" current={productSort} />
                    </TableHead>
                    <TableHead className="text-white font-bold">% do Total</TableHead>
                    <TableHead className="text-white font-bold">Classificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortItems(productRanking, productSort, productFilter).map(item => (
                    <TableRow key={item.name} className={abcColors[item.classification]}>
                      <TableCell className="font-medium">{item.position}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatCurrency(item.revenue)}</TableCell>
                      <TableCell>{item.percentage.toFixed(1)}%</TableCell>
                      <TableCell><Badge className={abcBadgeVariants[item.classification]}>{item.classification}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {sortItems(productRanking, productSort, productFilter).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum dado encontrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Total: {sortItems(productRanking, productSort, productFilter).length} produtos</p>
          </div>
        )}

        {/* Categories section */}
        {!isLoading && visibleSections.includes('categories') && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold flex items-center gap-2"><FolderOpen className="w-5 h-5" /> Categorias</h2>
              <ABCFilterButtons value={categoryFilter} onChange={setCategoryFilter} />
            </div>
            <div className="rounded-lg border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-600 hover:bg-red-600">
                    <TableHead className="text-white font-bold">Posição</TableHead>
                    <TableHead className="text-white font-bold">Categoria</TableHead>
                    <TableHead className="text-white font-bold cursor-pointer" onClick={() => toggleSort(categorySort, 'quantity', setCategorySort)}>
                      Qtd Itens Vendidos <SortIcon field="quantity" current={categorySort} />
                    </TableHead>
                    <TableHead className="text-white font-bold cursor-pointer" onClick={() => toggleSort(categorySort, 'revenue', setCategorySort)}>
                      Receita Total <SortIcon field="revenue" current={categorySort} />
                    </TableHead>
                    <TableHead className="text-white font-bold">% do Total</TableHead>
                    <TableHead className="text-white font-bold">Classificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortItems(categoryRanking, categorySort, categoryFilter).map(item => (
                    <TableRow key={item.name} className={abcColors[item.classification]}>
                      <TableCell className="font-medium">{item.position}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatCurrency(item.revenue)}</TableCell>
                      <TableCell>{item.percentage.toFixed(1)}%</TableCell>
                      <TableCell><Badge className={abcBadgeVariants[item.classification]}>{item.classification}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {sortItems(categoryRanking, categorySort, categoryFilter).length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum dado encontrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Total: {sortItems(categoryRanking, categorySort, categoryFilter).length} categorias</p>
          </div>
        )}

        {/* Optionals section */}
        {!isLoading && visibleSections.includes('optionals') && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Layers className="w-5 h-5" /> Adicionais</h2>
              <ABCFilterButtons value={optionalFilter} onChange={setOptionalFilter} />
            </div>
            <div className="rounded-lg border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-600 hover:bg-red-600">
                    <TableHead className="text-white font-bold">Posição</TableHead>
                    <TableHead className="text-white font-bold">Adicional</TableHead>
                    <TableHead className="text-white font-bold">Grupo</TableHead>
                    <TableHead className="text-white font-bold cursor-pointer" onClick={() => toggleSort(optionalSort, 'quantity', setOptionalSort)}>
                      Qtd Vendida <SortIcon field="quantity" current={optionalSort} />
                    </TableHead>
                    <TableHead className="text-white font-bold cursor-pointer" onClick={() => toggleSort(optionalSort, 'revenue', setOptionalSort)}>
                      Receita Extra <SortIcon field="revenue" current={optionalSort} />
                    </TableHead>
                    <TableHead className="text-white font-bold">% do Total</TableHead>
                    <TableHead className="text-white font-bold">Classificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortItems(optionalRankingFinal, optionalSort, optionalFilter).map(item => (
                    <TableRow key={item.name} className={abcColors[item.classification]}>
                      <TableCell className="font-medium">{item.position}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.group}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatCurrency(item.revenue)}</TableCell>
                      <TableCell>{item.percentage.toFixed(1)}%</TableCell>
                      <TableCell><Badge className={abcBadgeVariants[item.classification]}>{item.classification}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {sortItems(optionalRankingFinal, optionalSort, optionalFilter).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum dado encontrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Total: {sortItems(optionalRankingFinal, optionalSort, optionalFilter).length} adicionais</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
