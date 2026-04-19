import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UtensilsCrossed, Download } from 'lucide-react';
import { brl as formatPrice } from './_format';
import type { OccupiedTab } from './PDVV2TablesPanel';

interface Props {
  tabs: OccupiedTab[];
  onImport: (tab: OccupiedTab) => void;
}

/**
 * Visualização em grid (cards grandes) para a aba "Mesas" do PDV V2.
 * Substitui a coluna lateral em uma exibição mais clicável.
 */
export function PDVV2TablesGrid({ tabs, onImport }: Props) {
  if (tabs.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <UtensilsCrossed className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma mesa ocupada
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
      {tabs.map((tab) => (
        <Card key={tab.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg truncate">
                    {tab.tableNumber ? `Mesa ${tab.tableNumber}` : `Comanda ${tab.tabNumber}`}
                  </h3>
                </div>
                {tab.customerName && (
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {tab.customerName}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">Acumulado</p>
                <p className="text-xl font-bold tabular-nums text-primary">
                  {formatPrice(tab.total)}
                </p>
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={() => onImport(tab)}>
              <Download className="h-4 w-4 mr-2" />
              Importar e Cobrar
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
