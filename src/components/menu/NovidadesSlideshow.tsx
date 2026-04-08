import { useState, useEffect } from 'react';
import { Product } from '@/types/product';
import { cn } from '@/lib/utils';

interface NovidadesSlideshowProps {
  products: Product[];
  onProductSelect: (product: Product) => void;
}

export function NovidadesSlideshow({ products, onProductSelect }: NovidadesSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (products.length <= 1) return;
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % products.length);
        setIsAnimating(false);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, [products.length]);

  if (products.length === 0) return null;

  const product = products[currentIndex];

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200 dark:border-amber-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            ⭐ NOVIDADES
          </h2>
          {products.length > 1 && (
            <div className="flex gap-1">
              {products.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors duration-300",
                    i === currentIndex ? "bg-amber-500" : "bg-amber-300 dark:bg-amber-700"
                  )}
                />
              ))}
            </div>
          )}
        </div>
        <button
          className={cn(
            "w-full flex items-center gap-3 bg-card rounded-xl shadow-sm border border-border overflow-hidden text-left hover:shadow-md transition-all duration-300",
            isAnimating ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
          )}
          onClick={() => onProductSelect(product)}
        >
          {product.imageUrl ? (
            <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-24 h-24 flex-shrink-0 bg-muted flex items-center justify-center">
              <span className="text-3xl">🍽️</span>
            </div>
          )}
          <div className="py-2 pr-3 min-w-0">
            <p className="text-sm font-medium text-foreground line-clamp-2 break-words">{product.name}</p>
            {product.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>
            )}
            <p className="text-sm font-bold text-primary mt-1">R$ {product.price.toFixed(2)}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
