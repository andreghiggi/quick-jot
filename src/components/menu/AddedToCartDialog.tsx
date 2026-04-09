import { formatPrice } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, ShoppingCart, ArrowLeft, Plus, Minus, Trash2 } from 'lucide-react';
import { CartItem } from '@/types/product';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AddedToCartDialogProps {
  open: boolean;
  onClose: () => void;
  onContinueShopping: () => void;
  onGoToCart: () => void;
  lastAddedItem: CartItem | null;
  cartItems: CartItem[];
  cartItemsCount: number;
  cartTotal: number;
  onUpdateQuantity: (index: number, delta: number) => void;
  onRemoveItem: (index: number) => void;
  buttonColorStyle?: React.CSSProperties;
}

function calculateItemTotal(item: CartItem): number {
  const optionalsTotal = item.selectedOptionals.reduce((sum, opt) => sum + opt.price, 0);
  return (item.product.price + optionalsTotal) * item.quantity;
}

export function AddedToCartDialog({
  open,
  onClose,
  onContinueShopping,
  onGoToCart,
  lastAddedItem,
  cartItems,
  cartItemsCount,
  cartTotal,
  onUpdateQuantity,
  onRemoveItem,
  buttonColorStyle,
}: AddedToCartDialogProps) {
  if (!lastAddedItem) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={buttonColorStyle} className="max-w-sm mx-auto p-0 gap-0 rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Success header */}
        <div className="bg-primary/10 px-6 pt-5 pb-3 text-center flex-shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 mb-2">
            <CheckCircle className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Item adicionado!</h3>
        </div>

        {/* Cart items list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-muted-foreground px-1 mb-2">
              Itens no carrinho ({cartItemsCount})
            </p>
            {cartItems.map((item, index) => {
              const optionalsTotal = item.selectedOptionals.reduce((sum, opt) => sum + opt.price, 0);
              const unitPrice = item.product.price + optionalsTotal;
              const isLastAdded = index === cartItems.length - 1;

              return (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    isLastAdded ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
                  }`}
                >
                  {item.product.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">🍽️</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-foreground text-sm line-clamp-2 break-words flex-1">
                        {item.product.name}
                      </p>
                      <button
                        onClick={() => onRemoveItem(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5 flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {item.selectedOptionals.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        + {item.selectedOptionals.map(o => o.name).join(', ')}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">
                        Obs: {item.notes}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-green-600 font-bold text-sm">
                        R$ {formatPrice(calculateItemTotal(item))}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onUpdateQuantity(index, -1)}
                          className="h-6 w-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-semibold w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(index, 1)}
                          className="h-6 w-6 rounded-full border border-primary bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                        >
                          <Plus className="h-3 w-3 text-primary" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Cart total */}
        <div className="px-6 py-3 bg-muted/50 border-t border-border flex-shrink-0">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Total</span>
            <span className="font-bold text-foreground text-base">R$ {formatPrice(cartTotal)}</span>
          </div>
        </div>

        {/* Action buttons — continuar comprando first, fechar pedido second */}
        <div className="px-6 py-4 flex flex-col gap-2 flex-shrink-0">
          <Button
            variant="outline"
            className="w-full py-5 text-base border-primary text-primary bg-transparent hover:bg-primary/10"
            onClick={onContinueShopping}
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Continuar comprando
          </Button>
          <Button
            className="w-full py-5 text-base font-semibold"
            onClick={onGoToCart}
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            Fechar pedido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
