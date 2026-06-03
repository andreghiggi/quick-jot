import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ticket, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { Coupon } from '@/hooks/useCoupons';

interface CouponBannerProps {
  coupons: Coupon[];
}

function discountLabel(c: Coupon): string {
  if (c.discount_type === 'percent') return `${c.discount_value}% OFF`;
  return `R$ ${c.discount_value.toFixed(2).replace('.', ',')} OFF`;
}

function ruleLabel(c: Coupon): string {
  if (!c.min_order_value || c.min_order_value <= 0) return '';
  return `Acima de R$ ${c.min_order_value.toFixed(2).replace('.', ',')}`;
}

export function CouponBanner({ coupons }: CouponBannerProps) {
  const [open, setOpen] = useState(false);
  if (!coupons || coupons.length === 0) return null;

  const first = coupons[0];
  const moreCount = coupons.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 border-y border-primary/30 px-4 py-2.5 text-left hover:from-primary/20 hover:to-primary/20 transition-colors"
      >
        <div className="container mx-auto flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary flex-shrink-0">
            <Ticket className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              🎟️ Cupom <span className="font-mono">{first.code}</span> — {discountLabel(first)}
            </p>
            <p className="text-xs text-muted-foreground leading-tight">
              {[
                ruleLabel(first),
                moreCount > 0 ? `+${moreCount} cupom${moreCount > 1 ? 's' : ''} disponível${moreCount > 1 ? 'eis' : ''}` : '',
              ].filter(Boolean).join(' · ')}
              {(ruleLabel(first) || moreCount > 0) && ' · '}
              <span className="underline">Toque para ver</span>
            </p>
          </div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" /> Cupons disponíveis
            </DialogTitle>
            <DialogDescription>
              O cupom é aplicado automaticamente ao fechar o pedido quando você atinge as condições.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {coupons.map((c) => (
              <div key={c.id} className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-lg text-foreground">{c.code}</span>
                      <Badge className="bg-green-600 hover:bg-green-600 text-white">{discountLabel(c)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{ruleLabel(c)}</p>
                    {c.max_discount != null && (
                      <p className="text-xs text-muted-foreground">Desconto máximo: R$ {c.max_discount.toFixed(2).replace('.', ',')}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(c.code); toast.success('Código copiado!'); }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}