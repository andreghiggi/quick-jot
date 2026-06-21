import { useEffect } from 'react';

/**
 * Hook global de atalho de teclado. Escuta keydown no window e dispara
 * o handler quando a tecla informada (ex.: "F8") é pressionada.
 *
 * Não dispara quando o foco está em campos de entrada (input/textarea/
 * contentEditable) para não roubar teclas digitadas pelo usuário.
 */
export function useGlobalShortcut(key: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== key) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      handler(e);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, handler]);
}