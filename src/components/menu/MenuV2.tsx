import { useState } from 'react';
import { Product, ProductOptional, CartItem } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Plus, Search, ChevronLeft, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Category fallback images/emojis
const categoryEmojis: Record<string, string> = {
  'Açaí': '🍇',
  'Bebidas': '🥤',
  'Lanches': '🍔',
  'Pizzas': '🍕',
  'Hambúrguer': '🍔',
  'Sobremesas': '🍰',
  'Porções': '🍟',
  'Salgados': '🥟',
  'Doces': '🍩',
  'Sucos': '🧃',
  'Milk Shake': '🥤',
  'Picolés': '🍦',
  'Combos': '🎁',
  'Massas': '🍝',
  'Saladas': '🥗',
  'Carnes': '🥩',
  'Peixes': '🐟',
  'Frutos do Mar': '🦐',
  'Café': '☕',
  'Cervejas': '🍺',
};

function getCategoryEmoji(category: string, customEmojiMap?: Record<string, string>): string {
  // Try custom emoji from database first
  if (customEmojiMap && customEmojiMap[category]) return customEmojiMap[category];
  // Try exact match
  if (categoryEmojis[category]) return categoryEmojis[category];
  // Try case-insensitive partial match
  const lower = category.toLowerCase();
  for (const [key, emoji] of Object.entries(categoryEmojis)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return emoji;
    }
  }
  return '🍽️';
}

// Gradient colors for category cards
const categoryGradients = [
  'from-orange-500 to-amber-400',
  'from-rose-500 to-pink-400',
  'from-violet-500 to-purple-400',
  'from-blue-500 to-cyan-400',
  'from-emerald-500 to-green-400',
  'from-red-500 to-orange-400',
  'from-teal-500 to-emerald-400',
  'from-indigo-500 to-blue-400',
  'from-fuchsia-500 to-pink-400',
  'from-amber-500 to-yellow-400',
];

interface MenuV2Props {
  company: { id: string; name: string; slug: string; phone: string | null; address: string | null } | null;
  settings: {
    storeName: string;
    bannerUrl: string;
    [key: string]: any;
  };
  activeProducts: Product[];
  allOrderedCategories: string[];
  categoryEmojiMap?: Record<string, string>;
  categoryImageMap?: Record<string, string>;
  cartItemsCount: number;
  cartTotal: number;
  isOpen: boolean;
  formattedHours: string;
  onProductSelect: (product: Product) => void;
  onCartOpen: () => void;
  onNavigateBack: () => void;
}

export function MenuV2({
  company,
  settings,
  activeProducts,
  allOrderedCategories,
  categoryEmojiMap,
  categoryImageMap,
  cartItemsCount,
  cartTotal,
  isOpen,
  formattedHours,
  onProductSelect,
  onCartOpen,
  onNavigateBack,
}: MenuV2Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter products
  const filteredProducts = activeProducts.filter((product) => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Count products per category
  const productCountByCategory = allOrderedCategories.reduce((acc, cat) => {
    acc[cat] = activeProducts.filter((p) => p.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  // If a category is selected, show products in that category
  if (selectedCategory) {
    return (
      <div className="min-h-screen bg-background pb-24">
        {/* Category Header */}
        <div className="sticky top-0 z-20 bg-card border-b border-border shadow-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSelectedCategory(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-lg font-bold text-foreground">{selectedCategory}</h1>
                <Badge variant="secondary" className="text-xs">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'itens'}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="relative flex-shrink-0"
                onClick={onCartOpen}
              >
                <ShoppingCart className="h-4 w-4" />
                {cartItemsCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {cartItemsCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Search */}
            <div className="mt-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar nesta categoria..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
          </div>
        </div>

        {/* Products List */}
        <main className="container mx-auto px-4 py-4 space-y-3">
          {filteredProducts.map((product) => (
            <Card
              key={product.id}
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all overflow-hidden"
              onClick={() => onProductSelect(product)}
            >
              <CardContent className="p-0">
                <div className="flex">
                  {product.imageUrl ? (
                    <div className="w-28 h-28 flex-shrink-0">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-28 h-28 flex-shrink-0 bg-muted flex items-center justify-center">
                      <span className="text-3xl">{getCategoryEmoji(selectedCategory, categoryEmojiMap)}</span>
                    </div>
                  )}
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
                      {product.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-primary font-bold">R$ {product.price.toFixed(2)}</p>
                      <Button size="sm" className="h-8 px-3">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredProducts.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto nesta categoria'}
                </p>
              </CardContent>
            </Card>
          )}
        </main>

        {/* Floating cart button */}
        {cartItemsCount > 0 && (
          <div className="fixed bottom-4 left-4 right-4 z-30">
            <Button className="w-full py-6 shadow-lg" size="lg" onClick={onCartOpen}>
              <ShoppingCart className="h-5 w-5 mr-2" />
              Ver carrinho ({cartItemsCount} itens) - R$ {cartTotal.toFixed(2)}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Main category view
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Closed Store Banner */}
      {!isOpen && (
        <div className="bg-destructive/10 border-b border-destructive/20">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-2 text-destructive">
              <div className="flex-1">
                <p className="font-medium text-sm">⚠️ Estabelecimento fechado</p>
                <p className="text-xs opacity-80">
                  {formattedHours === 'Fechado hoje' ? 'Não abrimos hoje' : `Horário de hoje: ${formattedHours}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onNavigateBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-bold text-foreground">
                {settings.storeName || company?.name || 'Cardápio'}
              </h1>
            </div>
            <Button variant="outline" size="sm" className="relative flex-shrink-0" onClick={onCartOpen}>
              <ShoppingCart className="h-4 w-4" />
              {cartItemsCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {cartItemsCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Banner */}
      {settings.bannerUrl && (
        <div className="w-full relative overflow-hidden">
          {/* Blurred background fill */}
          <img
            src={settings.bannerUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
          />
          {/* Crisp centered banner */}
          <img
            src={settings.bannerUrl}
            alt="Banner"
            className="relative w-full max-h-56 sm:max-h-64 object-contain mx-auto"
          />
        </div>
      )}

      {/* Search */}
      <div className="container mx-auto px-4 mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar no cardápio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
      </div>

      {/* If searching, show product results directly */}
      {searchQuery ? (
        <main className="container mx-auto px-4 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''}
          </p>
          {filteredProducts.map((product) => (
            <Card
              key={product.id}
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all overflow-hidden"
              onClick={() => onProductSelect(product)}
            >
              <CardContent className="p-0">
                <div className="flex">
                  {product.imageUrl ? (
                    <div className="w-24 h-24 flex-shrink-0">
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-24 h-24 flex-shrink-0 bg-muted flex items-center justify-center">
                      <span className="text-2xl">{getCategoryEmoji(product.category, categoryEmojiMap)}</span>
                    </div>
                  )}
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>
                    <p className="text-primary font-bold">R$ {product.price.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredProducts.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nenhum produto encontrado</p>
              </CardContent>
            </Card>
          )}
        </main>
      ) : (
        /* Category Grid */
        <main className="container mx-auto px-4 py-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Categorias</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {allOrderedCategories.map((category, index) => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  setSearchQuery('');
                }}
                className={cn(
                  'relative overflow-hidden rounded-xl text-left transition-all',
                  'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
                  'shadow-md min-h-[120px] flex flex-col justify-between',
                  categoryImageMap?.[category]
                    ? 'text-white'
                    : cn('bg-gradient-to-br text-white p-4', categoryGradients[index % categoryGradients.length])
                )}
              >
                {categoryImageMap?.[category] ? (
                  <>
                    <img
                      src={categoryImageMap[category]}
                      alt={category}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="relative z-10 mt-auto p-4 pt-12">
                      <p className="font-bold text-sm leading-tight line-clamp-2">{category}</p>
                      <p className="text-xs opacity-80 mt-0.5">
                        {productCountByCategory[category]} {productCountByCategory[category] === 1 ? 'item' : 'itens'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-4xl opacity-80">{getCategoryEmoji(category, categoryEmojiMap)}</span>
                    <div className="mt-2">
                      <p className="font-bold text-sm leading-tight line-clamp-2">{category}</p>
                      <p className="text-xs opacity-80 mt-0.5">
                        {productCountByCategory[category]} {productCountByCategory[category] === 1 ? 'item' : 'itens'}
                      </p>
                    </div>
                    <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/10" />
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-white/5" />
                  </>
                )}
              </button>
            ))}
          </div>

          {allOrderedCategories.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nenhuma categoria disponível</p>
              </CardContent>
            </Card>
          )}
        </main>
      )}

      {/* Floating cart button */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <Button className="w-full py-6 shadow-lg" size="lg" onClick={onCartOpen}>
            <ShoppingCart className="h-5 w-5 mr-2" />
            Ver carrinho ({cartItemsCount} itens) - R$ {cartTotal.toFixed(2)}
          </Button>
        </div>
      )}
    </div>
  );
}
