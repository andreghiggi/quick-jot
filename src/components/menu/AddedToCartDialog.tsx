import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, ShoppingCart, ArrowLeft } from 'lucide-react';
import { CartItem } from '@/types/product';

interface AddedToCartDialogProps {
  open: boolean;
  onClose: () => void;
  onContinueShopping: () => void;
  onGoToCart: () => void;
  lastAddedItem: CartItem | null;
  cartItemsCount: number;
  cartTotal: number;
}

export function AddedToCartDialog({
  open,
  onClose,
  onContinueShopping,
  onGoToCart,
  lastAddedItem,
  cartItemsCount,
  cartTotal,
}: AddedToCartDialogProps) {
  if (!lastAddedItem) return null;

  const optionalsTotal = lastAddedItem.selectedOptionals.reduce((sum, opt) => sum + opt.price, 0);
  const itemPrice = lastAddedItem.product.price + optionalsTotal;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto p-0 gap-0 rounded-2xl overflow-hidden">
        {/* Success header */}
        <div className="bg-primary/10 px-6 pt-6 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/20 mb-3">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Adicionado ao carrinho!</h3>
        </div>

        {/* Item summary */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            {lastAddedItem.product.imageUrl ? (
              <img
                src={lastAddedItem.product.imageUrl}
                alt={lastAddedItem.product.name}
                className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🍽️</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm line-clamp-2 break-words">
                {lastAddedItem.product.name}
              </p>
              {lastAddedItem.selectedOptionals.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  + {lastAddedItem.selectedOptionals.map(o => o.name).join(', ')}
                </p>
              )}
              <p className="text-primary font-bold text-sm mt-1">
                R$ {itemPrice.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Cart summary */}
        <div className="px-6 py-3 bg-muted/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'itens'} no carrinho
            </span>
            <span className="font-bold text-foreground">R$ {cartTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-6 py-4 flex flex-col gap-2">
          <Button
            className="w-full py-5 text-base font-semibold"
            onClick={onGoToCart}
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            Fechar pedido
          </Button>
          <Button
            variant="outline"
            className="w-full py-5 text-base"
            onClick={onContinueShopping}
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Continuar comprando
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
