import { Power, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBusinessHours } from '@/hooks/useBusinessHours';
import { useAuthContext } from '@/contexts/AuthContext';

export function StoreAvailabilityControl({ companyId }: { companyId?: string | null }) {
  const { user, roles, company } = useAuthContext();
  const { isCurrentlyOpen, loading, availabilityError, availability } = useBusinessHours({ companyId });
  if (!companyId || !user || company?.id !== companyId || !roles.some(role => ['company_admin', 'company_user', 'super_admin', 'reseller'].includes(role))) return null;
  const open = isCurrentlyOpen();
  const busy = loading || availability.saving;
  return (
    <Button type="button" size="sm" variant={availabilityError ? 'outline' : open ? 'success' : 'destructive'}
      className="h-7 w-36 justify-start px-2 text-xs"
      disabled={busy}
      aria-label={availabilityError ? 'Consultar estado da loja' : open ? 'Fechar loja' : 'Abrir loja'}
      aria-pressed={!availabilityError && open}
      title={availabilityError ? 'Não foi possível consultar. Clique para tentar novamente.' : open ? 'Fechar a loja hoje, sem fechar o caixa' : 'Abrir a loja hoje, sem alterar os horários cadastrados'}
      onClick={() => availabilityError ? void availability.refetch() : void availability.setOpen(!open)}>
      {busy ? <Loader2 className="animate-spin" /> : availabilityError ? <RefreshCw /> : <Power />}
      {busy ? 'Aguarde…' : availabilityError ? 'Consultar estado' : open ? 'Loja Aberta' : 'Loja Fechada'}
    </Button>
  );
}