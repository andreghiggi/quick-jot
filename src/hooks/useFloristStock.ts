import { useQuery } from '@tanstack/react-query';
import { DEFAULT_FLORIST_STOCK, fetchFloristStockConfig } from '@/lib/floristStock';

/** Regras de estoque da floricultura. Fora do perfil (ou sem resposta) vale o padrão: nada é bloqueado. */
export function useFloristStock(companyId?: string | null, enabled = true) {
  const active = enabled && !!companyId;
  const query = useQuery({
    queryKey: ['florist-stock', companyId], enabled: active,
    queryFn: () => companyId ? fetchFloristStockConfig(companyId) : Promise.reject(new Error('Loja não encontrada')),
    staleTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: 'always', retry: 1,
  });
  return (active && query.data) || DEFAULT_FLORIST_STOCK;
}
