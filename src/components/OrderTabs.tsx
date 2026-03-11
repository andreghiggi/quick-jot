import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderCard } from './OrderCard';
import { useOrderContext } from '@/contexts/OrderContext';
import { Order, OrderStatus } from '@/types/order';
import { cn } from '@/lib/utils';
import { ClipboardList, ChefHat, PackageCheck, Truck } from 'lucide-react';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useAuthContext } from '@/contexts/AuthContext';

const tabs: { value: OrderStatus | 'all'; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'Todos', icon: ClipboardList },
  { value: 'pending', label: 'Pendentes', icon: ClipboardList },
  { value: 'preparing', label: 'Preparando', icon: ChefHat },
  { value: 'ready', label: 'Prontos', icon: PackageCheck },
  { value: 'delivered', label: 'Entregues', icon: Truck },
];

interface OrderTabsProps {
  filteredOrders?: Order[];
}

export function OrderTabs({ filteredOrders }: OrderTabsProps) {
  const { orders } = useOrderContext();
  const { company } = useAuthContext();
  const { settings } = useStoreSettings({ companyId: company?.id });

  const displayOrders = filteredOrders ?? orders;

  function getOrders(filter: OrderStatus | 'all') {
    if (filter === 'all') return displayOrders;
    return displayOrders.filter((order) => order.status === filter);
  }

  function getCount(filter: OrderStatus | 'all') {
    return getOrders(filter).length;
  }

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="w-full justify-start gap-1 bg-transparent p-0 h-auto flex-wrap">
        {tabs.map((tab) => {
          const count = getCount(tab.value);
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                "data-[state=active]:shadow-primary",
                "rounded-lg px-4 py-2 transition-all",
                "flex items-center gap-2"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {count > 0 && (
                <span className={cn(
                  "ml-1 text-xs px-1.5 py-0.5 rounded-full",
                  "bg-background/20"
                )}>
                  {count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {getOrders(tab.value).length > 0 ? (
              getOrders(tab.value).map((order) => (
                <OrderCard key={order.id} order={order} paperSize={settings.printerPaperSize} storeName={settings.storeName} />
              ))
            ) : (
              <div className="col-span-full text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <ClipboardList className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Nenhum pedido encontrado</p>
              </div>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
