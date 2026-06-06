import { useEffect, useMemo, useState } from 'react';
import { Search, Pencil, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import type { Product } from '@/types/product';

interface Props {
  products: Product[];
  onEdit: (product: Product) => void;
}

type StockFilter = 'all' | 'low' | 'no_gtin';

const PAGE_SIZE = 50;

/**
 * View densa estilo Gdoor para o módulo Mercado.
 * Componente totalmente isolado — não toca em nenhum fluxo existente.
 * Reusa apenas o callback `onEdit` (que abre o diálogo de edição atual).
 */
export function ProductsMercadoView({ products, onEdit }: Props) {
  // Estado persistido em sessionStorage para sobreviver à navegação
  // até a página de edição de produto e voltar.
  const [query, setQuery] = useState<string>(() => {
    try { return sessionStorage.getItem('mercado:query') ?? ''; } catch { return ''; }
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('mercado:category') ?? 'all'; } catch { return 'all'; }
  });
  const [stockFilter, setStockFilter] = useState<StockFilter>(() => {
    try {
      const v = sessionStorage.getItem('mercado:stock');
      return (v === 'low' || v === 'no_gtin' || v === 'all') ? v : 'all';
    } catch { return 'all'; }
  });
  const [page, setPage] = useState<number>(() => {
    try { return Number(sessionStorage.getItem('mercado:page') ?? 0) || 0; } catch { return 0; }
  });

  useEffect(() => { try { sessionStorage.setItem('mercado:query', query); } catch {} }, [query]);
  useEffect(() => { try { sessionStorage.setItem('mercado:category', categoryFilter); } catch {} }, [categoryFilter]);
  useEffect(() => { try { sessionStorage.setItem('mercado:stock', stockFilter); } catch {} }, [stockFilter]);
  useEffect(() => { try { sessionStorage.setItem('mercado:page', String(page)); } catch {} }, [page]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (categoryFilter === 'all' ? true : p.category === categoryFilter))
      .filter((p) => {
        if (stockFilter === 'low') {
          if (!p.trackStock) return false;
          const saldo = Number(p.stockQuantity ?? 0);
          const min = Number(p.minStock ?? 0);
          return saldo <= min;
        }
        if (stockFilter === 'no_gtin') return !p.gtin;
        return true;
      })
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            (p.code || '').toLowerCase().includes(q) ||
            (p.gtin || '').toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, query, categoryFilter, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, SKU ou GTIN…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={resetPage(setCategoryFilter)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={stockFilter}
              onValueChange={(v) => resetPage(setStockFilter)(v as StockFilter)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os itens</SelectItem>
                <SelectItem value="low">Estoque ≤ mínimo</SelectItem>
                <SelectItem value="no_gtin">Sem GTIN</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filtered.length === 0
                ? 'Nenhum item'
                : `${safePage * PAGE_SIZE + 1}–${Math.min(
                    (safePage + 1) * PAGE_SIZE,
                    filtered.length,
                  )} de ${filtered.length}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                {safePage + 1}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            {pageItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Nenhum produto encontrado com os filtros atuais.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 font-medium">SKU</th>
                      <th className="text-left p-2 font-medium">Produto</th>
                      <th className="text-left p-2 font-medium hidden md:table-cell">GTIN</th>
                      <th className="text-left p-2 font-medium hidden lg:table-cell">Categoria</th>
                      <th className="text-center p-2 font-medium hidden sm:table-cell">Un</th>
                      <th className="text-right p-2 font-medium">Estoque</th>
                      <th className="text-right p-2 font-medium hidden md:table-cell">Mín.</th>
                      <th className="text-right p-2 font-medium">Preço</th>
                      <th className="text-right p-2 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pageItems.map((p) => {
                      const saldo = Number(p.stockQuantity ?? 0);
                      const min = Number(p.minStock ?? 0);
                      const tone = !p.trackStock
                        ? 'text-muted-foreground'
                        : saldo <= 0
                          ? 'text-destructive'
                          : saldo <= min
                            ? 'text-amber-600'
                            : 'text-emerald-600';
                      return (
                        <tr key={p.id} className={`hover:bg-muted/30 ${!p.active ? 'opacity-50' : ''}`}>
                          <td className="p-2 tabular-nums text-xs text-muted-foreground">
                            {p.code || '—'}
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{p.name}</div>
                            {!p.active && (
                              <Badge variant="secondary" className="mt-1 text-xs">
                                Inativo
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 tabular-nums text-xs hidden md:table-cell text-muted-foreground">
                            {p.gtin || '—'}
                          </td>
                          <td className="p-2 hidden lg:table-cell text-muted-foreground text-xs">
                            {p.category}
                          </td>
                          <td className="p-2 text-center text-xs text-muted-foreground hidden sm:table-cell">
                            {p.unit || '—'}
                          </td>
                          <td className={`p-2 text-right tabular-nums font-semibold ${tone}`}>
                            {p.trackStock ? saldo : '—'}
                          </td>
                          <td className="p-2 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                            {p.trackStock ? min : '—'}
                          </td>
                          <td className="p-2 text-right tabular-nums font-semibold text-emerald-600">
                            R$ {p.price.toFixed(2).replace('.', ',')}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onEdit(p)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}