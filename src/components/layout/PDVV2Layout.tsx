import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { PDVV2Sidebar } from './PDVV2Sidebar';

/**
 * Layout exclusivo das páginas servidas a lojas com PDV V2.
 * Não substitui AppLayout — é um wrapper paralelo usado apenas pela rota /pdv-v2.
 */
export function PDVV2Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <PDVV2Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2 bg-card sticky top-0 z-30">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
