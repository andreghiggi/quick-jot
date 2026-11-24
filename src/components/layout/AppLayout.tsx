import { ReactNode, useMemo } from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';
import { FrenteCaixaFAB } from './FrenteCaixaFAB';
import { StoreAvailabilityControl } from '@/components/StoreAvailabilityControl';
import { useAuthContext } from '@/contexts/AuthContext';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  const { company } = useAuthContext();
  const showStoreControl = (!title || title === 'Dashboard' || title === 'Pedidos') && !!company;
  // Memoize sidebar to prevent re-renders on navigation
  const sidebar = useMemo(() => <AppSidebar />, []);

  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        <header className={`flex min-h-16 shrink-0 flex-wrap ${showStoreControl ? 'items-start' : 'items-center'} gap-2 border-b border-border px-4 py-2 bg-background/80 backdrop-blur-lg sticky top-0 z-40`}>
          <SidebarTrigger className={showStoreControl ? '-ml-1 mt-1' : '-ml-1'} />
          <Separator orientation="vertical" className={showStoreControl ? 'mr-2 mt-2.5 h-4' : 'mr-2 h-4'} />
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <span className={showStoreControl ? 'truncate font-semibold leading-9' : 'truncate font-semibold'}>{showStoreControl ? company?.name : title || 'Dashboard'}</span>
            {showStoreControl && <StoreAvailabilityControl companyId={company?.id} />}
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
          </div>
          {actions && (
            <div className="ml-auto flex min-h-9 items-center gap-2">
              {actions}
            </div>
          )}
        </header>
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
        <FrenteCaixaFAB />
      </SidebarInset>
    </SidebarProvider>
  );
}
