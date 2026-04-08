import { useState, useEffect, useRef, useCallback } from 'react';
import { Product } from '@/types/product';
import { cn } from '@/lib/utils';

interface NovidadesSlideshowProps {
  products: Product[];
  onProductSelect: (product: Product) => void;
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <button
      className="w-full flex-shrink-0 flex items-center gap-3 bg-card rounded-xl shadow-sm border border-border overflow-hidden text-left hover:shadow-md"
      onClick={onClick}
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
          <p className="text-xs text-muted-foreground mt-0.5 break-words whitespace-normal">{product.description}</p>
        )}
        <p className="text-sm font-bold text-primary mt-1">R$ {product.price.toFixed(2)}</p>
      </div>
    </button>
  );
}

export function NovidadesSlideshow({ products, onProductSelect }: NovidadesSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAutoAnimating, setIsAutoAnimating] = useState(false);
  const [skipTransition, setSkipTransition] = useState(false);
  const touchStartX = useRef(0);
  const containerWidth = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAnimRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalProducts = products.length;

  const goTo = useCallback((newIndex: number) => {
    const dir = newIndex > currentIndex ? -1 : 1;
    setSkipTransition(false);
    setIsAutoAnimating(true);
    setOffset(dir * 100);

    if (autoAnimRef.current) clearTimeout(autoAnimRef.current);
    autoAnimRef.current = setTimeout(() => {
      setSkipTransition(true);
      setIsAutoAnimating(false);
      setCurrentIndex(((newIndex % totalProducts) + totalProducts) % totalProducts);
      setOffset(0);
      // Re-enable transition after the snap
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSkipTransition(false);
        });
      });
    }, 700);
  }, [currentIndex, totalProducts]);

  const goNext = useCallback(() => {
    goTo(currentIndex + 1);
  }, [currentIndex, goTo]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (totalProducts > 1) {
      timerRef.current = setInterval(goNext, 4000);
    }
  }, [totalProducts, goNext]);

  useEffect(() => {
    if (totalProducts <= 1) return;
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [totalProducts, startTimer]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAutoAnimating) return;
    touchStartX.current = e.touches[0].clientX;
    containerWidth.current = containerRef.current?.offsetWidth || 1;
    setIsDragging(true);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || isAutoAnimating) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    const pct = (delta / containerWidth.current) * 100;
    setOffset(pct);
  };

  const handleTouchEnd = () => {
    if (!isDragging || isAutoAnimating) return;
    setIsDragging(false);

    if (totalProducts <= 1) { setOffset(0); startTimer(); return; }

    const threshold = 20; // percentage
    if (offset < -threshold) {
      setIsAutoAnimating(true);
      setOffset(-100);
      if (autoAnimRef.current) clearTimeout(autoAnimRef.current);
      autoAnimRef.current = setTimeout(() => {
        setSkipTransition(true);
        setIsAutoAnimating(false);
        setCurrentIndex((prev) => (prev + 1) % totalProducts);
        setOffset(0);
        requestAnimationFrame(() => { requestAnimationFrame(() => { setSkipTransition(false); }); });
      }, 400);
    } else if (offset > threshold) {
      setIsAutoAnimating(true);
      setOffset(100);
      if (autoAnimRef.current) clearTimeout(autoAnimRef.current);
      autoAnimRef.current = setTimeout(() => {
        setSkipTransition(true);
        setIsAutoAnimating(false);
        setCurrentIndex((prev) => (prev - 1 + totalProducts) % totalProducts);
        setOffset(0);
        requestAnimationFrame(() => { requestAnimationFrame(() => { setSkipTransition(false); }); });
      }, 400);
    } else {
      // snap back
      setOffset(0);
    }
    startTimer();
  };

  if (products.length === 0) return null;

  const prevIndex = (currentIndex - 1 + totalProducts) % totalProducts;
  const nextIndex = (currentIndex + 1) % totalProducts;

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200 dark:border-amber-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            ⭐ NOVIDADES
          </h2>
          {totalProducts > 1 && (
            <div className="flex gap-1.5">
              {products.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { if (!isAutoAnimating) { goTo(i); startTimer(); } }}
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
          ref={containerRef}
          className="overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex"
            style={{
              transform: `translateX(${offset}%)`,
              transition: (isDragging || skipTransition) ? 'none' : 'transform 0.7s cubic-bezier(0.25, 0.1, 0.25, 1)',
            }}
          >
            {/* Previous (off-screen left) */}
            <div className="w-full flex-shrink-0" style={{ marginLeft: '-100%' }}>
              <ProductCard product={products[prevIndex]} onClick={() => onProductSelect(products[prevIndex])} />
            </div>
            {/* Current */}
            <div className="w-full flex-shrink-0">
              <ProductCard product={products[currentIndex]} onClick={() => onProductSelect(products[currentIndex])} />
            </div>
            {/* Next (off-screen right) */}
            <div className="w-full flex-shrink-0">
              <ProductCard product={products[nextIndex]} onClick={() => onProductSelect(products[nextIndex])} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
