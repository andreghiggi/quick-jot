import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ResellerSidebar } from './ResellerSidebar';

interface ResellerLayoutProps {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
}

export function ResellerLayout({ children, title, actions }: ResellerLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ResellerSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b px-4 gap-4">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold flex-1">{title}</h1>
            {actions}
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
