import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UtensilsCrossed, Download } from 'lucide-react';
import { brl as formatPrice } from './_format';

export interface OccupiedTab {
  id: string;
  tabNumber: number;
  tableNumber?: number | null;
  customerName?: string | null;
  total: number;
}

interface PDVV2TablesPanelProps {
  tabs: OccupiedTab[];
  onImport: (tab: OccupiedTab) => void;
}

export function PDVV2TablesPanel({ tabs, onImport }: PDVV2TablesPanelProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UtensilsCrossed className="h-4 w-4" />
          Mesas Ocupadas
          <span className="text-xs text-muted-foreground font-normal">({tabs.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="px-4 pb-4 space-y-2">
            {tabs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma mesa ocupada
              </p>
            ) : (
              tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="border rounded-lg p-3 space-y-2 bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">
                        {tab.tableNumber ? `Mesa ${tab.tableNumber}` : `Comanda ${tab.tabNumber}`}
                      </p>
                      {tab.customerName && (
                        <p className="text-xs text-muted-foreground truncate">{tab.customerName}</p>
                      )}
                    </div>
                    <span className="font-bold tabular-nums text-sm">{formatPrice(tab.total)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => onImport(tab)}
                  >
                    <Download className="h-3 w-3 mr-2" />
                    Importar
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
