import { useCallback } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGlobalShortcut } from '@/hooks/useGlobalShortcut';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Botão flutuante de acesso rápido à Frente de Caixa.
 *
 * - Aparece apenas quando o módulo `mercado` está ativo para a loja.
 * - Escondido em viewports mobile (a operação de caixa em celular usa rota direta).
 * - Abre `/frente-caixa` sempre em uma aba nomeada ("comandatech-frente-caixa"),
 *   reaproveitando a aba caso já esteja aberta.
 * - Atalho global F8.
 */
export function FrenteCaixaFAB() {
  const { company } = useAuthContext();
  const { enabled: mercadoOn } = useMercadoEnabled(company?.id);
  const isMobile = useIsMobile();
  const { pathname } = useLocation();

  const open = useCallback(() => {
    window.open('/frente-caixa', 'comandatech-frente-caixa');
  }, []);

  const onFrenteCaixa = pathname.startsWith('/frente-caixa');
  const shouldRender = mercadoOn && !isMobile && !onFrenteCaixa;

  // Hook precisa ser chamado incondicionalmente; só dispara se renderizar.
  useGlobalShortcut('F8', () => {
    if (shouldRender) open();
  });

  if (!shouldRender) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={open}
            aria-label="Abrir Frente de Caixa (atalho F8)"
            className={cn(
              'fixed bottom-6 right-6 z-40',
              'h-14 w-14 rounded-full',
              'bg-primary text-primary-foreground',
              'shadow-lg hover:shadow-xl',
              'flex items-center justify-center',
              'transition-transform duration-150 hover:scale-105 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
          >
            <ShoppingCart className="h-6 w-6" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="font-medium">
          Frente de Caixa <span className="opacity-70">(F8)</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}