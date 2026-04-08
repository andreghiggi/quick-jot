import { useState, useEffect, useRef, useCallback } from 'react';
import { Product } from '@/types/product';
import { cn } from '@/lib/utils';

interface NovidadesSlideshowProps {
  products: Product[];
  onProductSelect: (product: Product) => void;
}

export function NovidadesSlideshow({ products, onProductSelect }: NovidadesSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [animState, setAnimState] = useState<'enter' | 'exit'>('enter');
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTransitioning = useRef(false);

  const transition = useCallback((newIndex: number, dir: 'left' | 'right') => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    setDirection(dir);
    setAnimState('exit');
    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimState('enter');
      setTimeout(() => {
        isTransitioning.current = false;
      }, 300);
    }, 300);
  }, []);

  const goNext = useCallback(() => {
    transition((currentIndex + 1) % products.length, 'left');
  }, [currentIndex, products.length, transition]);

  const goPrev = useCallback(() => {
    transition((currentIndex - 1 + products.length) % products.length, 'right');
  }, [currentIndex, products.length, transition]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (products.length > 1) {
      timerRef.current = setInterval(goNext, 4000);
    }
  }, [products.length, goNext]);

  useEffect(() => {
    if (products.length <= 1) return;
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [products.length, startTimer]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    if (products.length <= 1) return;
    const threshold = 50;
    if (touchDeltaX.current < -threshold) {
      goNext();
      startTimer();
    } else if (touchDeltaX.current > threshold) {
      goPrev();
      startTimer();
    }
  };

  if (products.length === 0) return null;

  const product = products[currentIndex];

  const slideClass = cn(
    "w-full flex items-center gap-3 bg-card rounded-xl shadow-sm border border-border overflow-hidden text-left hover:shadow-md transition-all duration-300 ease-in-out",
    animState === 'exit' && direction === 'left' && "-translate-x-full opacity-0",
    animState === 'exit' && direction === 'right' && "translate-x-full opacity-0",
    animState === 'enter' && "translate-x-0 opacity-100",
  );

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200 dark:border-amber-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            ⭐ NOVIDADES
          </h2>
          {products.length > 1 && (
            <div className="flex gap-1.5">
              {products.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { transition(i, i > currentIndex ? 'left' : 'right'); startTimer(); }}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors duration-300",
                    i === currentIndex ? "bg-amber-500" : "bg-amber-300 dark:bg-amber-700"
                  )}
                />
              ))}
            </div>
          )}
        </div>
        <div
          className="overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <button
            className={slideClass}
            onClick={() => onProductSelect(product)}
          >
            {product.imageUrl ? (
              <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
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
    </div>
  );
}
