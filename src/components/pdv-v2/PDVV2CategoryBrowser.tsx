import { useMemo, useState } from 'react';
import { ArrowLeft, Search, Plus, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useCategories } from '@/hooks/useCategories';
import { useSubcategories } from '@/hooks/useSubcategories';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types/product';
import { cn, formatPrice } from '@/lib/utils';

// Same gradients/emojis as MenuV2 (cardápio público)
const categoryEmojis: Record<string, string> = {
  'Açaí': '🍇', 'Bebidas': '🥤', 'Lanches': '🍔', 'Pizzas': '🍕',
  'Hambúrguer': '🍔', 'Sobremesas': '🍰', 'Porções': '🍟', 'Salgados': '🥟',
  'Doces': '🍩', 'Sucos': '🧃', 'Milk Shake': '🥤', 'Picolés': '🍦',
  'Combos': '🎁', 'Massas': '🍝', 'Saladas': '🥗', 'Carnes': '🥩',
  'Peixes': '🐟', 'Frutos do Mar': '🦐', 'Café': '☕', 'Cervejas': '🍺',
};
function getCategoryEmoji(category: string, customEmojiMap?: Record<string, string>): string {
  if (customEmojiMap && customEmojiMap[category]) return customEmojiMap[category];
  if (categoryEmojis[category]) return categoryEmojis[category];
  const lower = category.toLowerCase();
  for (const [key, emoji] of Object.entries(categoryEmojis)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return emoji;
  }
  return '🍽️';
}
const categoryGradients = [
  'from-orange-500 to-amber-400', 'from-rose-500 to-pink-400',
  'from-violet-500 to-purple-400', 'from-blue-500 to-cyan-400',
  'from-emerald-500 to-green-400', 'from-red-500 to-orange-400',
  'from-teal-500 to-emerald-400', 'from-indigo-500 to-blue-400',
  'from-fuchsia-500 to-pink-400', 'from-amber-500 to-yellow-400',
];

interface Props {
  companyId?: string;
  /** Filtra apenas itens visíveis no PDV (pdvItem !== false) */
  pdvOnly?: boolean;
  onProductSelect: (product: Product) => void;
  /** Altura máxima da área de rolagem (default: 60vh) */
  maxHeightClassName?: string;
}

/**
 * Layout idêntico ao cardápio público (MenuV2):
 * Categorias em grid de cards com foto/emoji → subcategorias (se houver) → produtos.
 *
 * Reutilizado no Pedido Express (etapa 1) e no popup "Adicionar Item" do PDV V2,
 * inicialmente apenas para a Lancheria I9.
 */
export function PDVV2CategoryBrowser({
  companyId,
  pdvOnly = true,
  onProductSelect,
  maxHeightClassName = 'max-h-[60vh]',
}: Props) {
  const { categories } = useCategories({ companyId });
  const { subcategories } = useSubcategories({ companyId });
  const { products } = useProducts({ companyId });

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const activeProducts = useMemo(
    () => products.filter((p) => p.active && (!pdvOnly || p.pdvItem !== false)),
    [products, pdvOnly],
  );

  const orderedCategories = useMemo(() => {
    const visibleCategoryNames = new Set(activeProducts.map((p) => p.category));
    return categories
      .filter((c) => c.active !== false && (!pdvOnly || (c as any).pdvItem !== false) && visibleCategoryNames.has(c.name))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((c) => c.name);
  }, [categories, activeProducts, pdvOnly]);

  const categoryEmojiMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { if (c.emoji) map[c.name] = c.emoji; });
    return map;
  }, [categories]);
  const categoryImageMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { if (c.imageUrl) map[c.name] = c.imageUrl; });
    return map;
  }, [categories]);
  const categoryIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  const categorySubcategories = selectedCategory && categoryIdMap[selectedCategory]
    ? subcategories.filter((s) => s.categoryId === categoryIdMap[selectedCategory] && s.active && (!pdvOnly || s.pdvItem !== false))
    : [];

  const filteredProducts = activeProducts.filter((product) => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSubcategory = !selectedSubcategoryId || product.subcategoryId === selectedSubcategoryId;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      product.name.toLowerCase().includes(q) ||
      product.description?.toLowerCase().includes(q);
    return matchesCategory && matchesSubcategory && matchesSearch;
  });

  // Search across everything when searchQuery is set and no category selected
  const isSearching = !!searchQuery.trim() && !selectedCategory;

  function reset() {
    setSelectedCategory(null);
    setSelectedSubcategoryId(null);
    setSearchQuery('');
  }
  function handleBack() {
    if (selectedSubcategoryId) {
      setSelectedSubcategoryId(null);
    } else if (selectedCategory) {
      setSelectedCategory(null);
    }
  }

  // ===== Header =====
  const header = (
    <div className="sticky top-0 z-10 bg-card border-b border-border -mx-1 px-1 py-2 mb-2">
      <div className="flex items-center gap-2 mb-2">
        {(selectedCategory || isSearching) && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h3 className="text-sm font-semibold flex-1 truncate">
          {selectedCategory || (isSearching ? 'Buscar' : 'Categorias')}
        </h3>
        {selectedCategory && categorySubcategories.length > 0 && !selectedSubcategoryId && (
          <Badge variant="secondary" className="text-[10px]">Escolha uma subcategoria</Badge>
        )}
        {(selectedCategory && (selectedSubcategoryId || categorySubcategories.length === 0)) && (
          <Badge variant="secondary" className="text-[10px]">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'itens'}
          </Badge>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={selectedCategory ? 'Buscar nesta categoria...' : 'Buscar produto...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-9"
          autoFocus={false}
          tabIndex={-1}
        />
      </div>
    </div>
  );

  // ===== Subcategoria selection =====
  if (selectedCategory && categorySubcategories.length > 0 && !selectedSubcategoryId && !searchQuery.trim()) {
    return (
      <div className={cn('overflow-y-auto', maxHeightClassName)}>
        {header}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-1">
          {categorySubcategories.map((sub, index) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedSubcategoryId(sub.id)}
              className={cn(
                'relative overflow-hidden rounded-xl text-left transition-all',
                'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
                'shadow-md min-h-[110px] flex flex-col justify-between',
                sub.imageUrl ? 'text-white' : cn('bg-gradient-to-br text-white p-4', categoryGradients[index % categoryGradients.length]),
              )}
            >
              {sub.imageUrl ? (
                <>
                  <img src={sub.imageUrl} alt={sub.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="relative z-10 mt-auto p-3 pt-16">
                    <p className="font-bold text-xs leading-tight line-clamp-2 text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{sub.name}</p>
                  </div>
                </>
              ) : (
                <p className="font-bold text-xs leading-tight line-clamp-2 text-white mt-auto" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{sub.name}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ===== Produtos (categoria selecionada OU busca) =====
  if (selectedCategory || isSearching) {
    return (
      <div className={cn('overflow-y-auto', maxHeightClassName)}>
        {header}
        <div className="space-y-2 px-1">
          {filteredProducts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto nesta categoria'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:border-primary hover:shadow-md transition-all overflow-hidden"
                onClick={() => onProductSelect(product)}
              >
                <CardContent className="p-0">
                  <div className="flex h-full">
                    {product.imageUrl ? (
                      <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
                        <img src={product.imageUrl} alt={product.name} loading="eager" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-24 h-24 flex-shrink-0 bg-muted flex items-center justify-center">
                        <span className="text-3xl">{getCategoryEmoji(product.category, categoryEmojiMap)}</span>
                      </div>
                    )}
                    <div className="flex-1 p-2.5 flex flex-col justify-between min-w-0">
                      <div>
                        <h3 className="font-semibold text-sm text-foreground line-clamp-2 break-words">{product.name}</h3>
                        {product.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-green-600 font-bold text-sm">R$ {formatPrice(product.price)}</p>
                        <Button size="sm" className="h-7 px-2">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  // ===== Grid principal de categorias =====
  return (
    <div className={cn('overflow-y-auto', maxHeightClassName)}>
      {header}
      {orderedCategories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma categoria disponível</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1">
          {orderedCategories.map((category, index) => (
            <button
              key={category}
              type="button"
              onClick={() => { setSelectedCategory(category); setSearchQuery(''); }}
              className={cn(
                'relative overflow-hidden rounded-xl text-left transition-all',
                'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
                'shadow-md min-h-[110px] flex flex-col justify-between',
                categoryImageMap[category]
                  ? 'text-white'
                  : cn('bg-gradient-to-br text-white p-3', categoryGradients[index % categoryGradients.length]),
              )}
            >
              {categoryImageMap[category] ? (
                <>
                  <img src={categoryImageMap[category]} alt={category} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="relative z-10 mt-auto p-3 pt-16">
                    <p className="font-bold text-xs leading-tight line-clamp-2 text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{category}</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-3xl opacity-80">{getCategoryEmoji(category, categoryEmojiMap)}</span>
                  <p className="font-bold text-xs leading-tight line-clamp-2 text-white mt-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{category}</p>
                  <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-white/10" />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white/5" />
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
