// Regras de estoque — exibido SOMENTE no perfil floricultura.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, PackageMinus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchFloristStockConfig, saveFloristStockConfig, type FloristStockConfig } from '@/lib/floristStock';

export function FloristStockSettings({ companyId }: { companyId?: string }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const queryKey = ['florist-stock', companyId];
  const query = useQuery({
    queryKey, enabled: !!companyId, staleTime: 0,
    queryFn: () => companyId ? fetchFloristStockConfig(companyId) : Promise.reject(new Error('Loja não encontrada')),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<FloristStockConfig>) => {
      if (!companyId) throw new Error('Loja não encontrada');
      return saveFloristStockConfig(companyId, patch);
    },
    onSuccess: (config) => {
      client.setQueryData(queryKey, config);
      toast({ title: 'Regra de estoque salva' });
    },
    onError: () => toast({ title: 'Erro ao salvar', description: 'Tente novamente em instantes.', variant: 'destructive' }),
    onSettled: () => { void client.invalidateQueries({ queryKey }); },
  });

  if (query.isPending || query.isError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {query.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Não foi possível carregar as regras de estoque. Recarregue a página.'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageMinus className="h-4 w-4" /> Estoque
        </CardTitle>
        <CardDescription>
          Vale para produtos com “Controlar estoque” ligado no cadastro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="florist-stock-deduct" className="cursor-pointer">Baixar estoque ao finalizar venda</Label>
            <p className="text-[11px] text-muted-foreground">
              Pedido do Catálogo Online baixa ao ser confirmado; pedido do Balcão baixa ao ser criado.
              Cancelar ou excluir o pedido devolve os itens. A Frente de Caixa continua baixando o estoque nas vendas dela.
            </p>
          </div>
          <Switch
            id="florist-stock-deduct"
            checked={query.data.deductOnOrders}
            disabled={mutation.isPending}
            onCheckedChange={(checked) => mutation.mutate({ deductOnOrders: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="florist-stock-zero" className="cursor-pointer">Permitir a venda de produtos com estoque zerado</Label>
            <p className="text-[11px] text-muted-foreground">
              Desligado, o Catálogo Online, o Balcão e a Frente de Caixa não deixam vender além do saldo em estoque.
            </p>
          </div>
          <Switch
            id="florist-stock-zero"
            checked={query.data.allowZeroStockSale}
            disabled={mutation.isPending}
            onCheckedChange={(checked) => mutation.mutate({ allowZeroStockSale: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
