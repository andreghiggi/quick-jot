// Baixa de estoque pelos pedidos — exibido SOMENTE no perfil floricultura.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, PackageMinus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchFloristStockConfig, saveFloristStockConfig } from '@/lib/floristStock';

export function FloristStockSettings({ companyId }: { companyId?: string }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const queryKey = ['florist-stock', companyId];
  const query = useQuery({
    queryKey, enabled: !!companyId, staleTime: 0,
    queryFn: () => companyId ? fetchFloristStockConfig(companyId) : Promise.reject(new Error('Loja não encontrada')),
  });
  const mutation = useMutation({
    mutationFn: (deductOnOrders: boolean) => {
      if (!companyId) throw new Error('Loja não encontrada');
      return saveFloristStockConfig(companyId, { deductOnOrders });
    },
    onSuccess: (config) => {
      client.setQueryData(queryKey, config);
      toast({ title: config.deductOnOrders ? 'Baixa de estoque pelos pedidos ligada' : 'Baixa de estoque pelos pedidos desligada' });
    },
    onError: () => toast({ title: 'Erro ao salvar', description: 'Tente novamente em instantes.', variant: 'destructive' }),
    onSettled: () => { void client.invalidateQueries({ queryKey }); },
  });

  if (query.isPending || query.isError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {query.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Não foi possível carregar a regra de estoque. Recarregue a página.'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageMinus className="w-5 h-5" />
          Estoque dos Pedidos
        </CardTitle>
        <CardDescription>
          Vale para produtos com “Controlar estoque” ligado no cadastro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
          <div className="min-w-0">
            <Label htmlFor="florist-stock-orders" className="font-medium">Baixar estoque pelos pedidos</Label>
            <p className="text-sm text-muted-foreground">
              Pedido do Catálogo Online baixa ao ser confirmado; pedido do Balcão baixa ao ser criado.
              Cancelar ou excluir o pedido devolve os itens ao estoque.
            </p>
          </div>
          <Switch
            id="florist-stock-orders"
            checked={query.data.deductOnOrders}
            disabled={mutation.isPending}
            onCheckedChange={(checked) => mutation.mutate(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
