import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingBag,
  Package,
  LogOut,
  Settings,
  CreditCard,
  CircleDollarSign,
  Receipt,
  FileText,
  Layers,
  LayoutList,
  FolderOpen,
  BarChart3,
  Wallet,
  Megaphone,
  ChefHat,
  Monitor,
} from 'lucide-react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import logoIcon from '@/assets/logo-icon.png';

/**
 * Sidebar exclusiva para lojas com PDV V2 ativo.
 * Oculta: Dashboard, PDV (V1), Garçom.
 * Mostra: PDV V2 (home), Pedidos, Catálogo, Fiscal, Financeiro, Relatórios, Configurações.
 */
export function PDVV2Sidebar() {
  const location = useLocation();
  const { user, profile, company, signOut } = useAuthContext();
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const home = [{ title: 'Central PDV V2', icon: Monitor, href: '/pdv-v2' }];
  const operations = [{ title: 'Pedidos', icon: ShoppingBag, href: '/pedidos' }];

  const catalog = [
    { title: 'Categorias', icon: FolderOpen, href: '/categorias' },
    { title: 'Subcategorias', icon: LayoutList, href: '/subcategorias' },
    { title: 'Produtos', icon: Package, href: '/produtos' },
    { title: 'Adicionais', icon: Layers, href: '/adicionais' },
    { title: 'Ver cardápio', icon: ChefHat, href: `/cardapio/${company?.slug || ''}` },
  ];

  const finance = [
    { title: 'Caixa', icon: CircleDollarSign, href: '/financeiro/caixa' },
    { title: 'Formas de Pagamento', icon: CreditCard, href: '/formas-pagamento' },
  ];

  const fiscal = isModuleEnabled('fiscal')
    ? [
        { title: 'Fiscal', icon: Receipt, href: '/fiscal' },
        { title: 'NFC-e Monitor', icon: FileText, href: '/nfce' },
      ]
    : [];

  const reports = [
    { title: 'Relatório de Vendas', icon: Wallet, href: '/relatorios/vendas' },
    { title: 'Relatório de Clientes', icon: BarChart3, href: '/relatorios/clientes' },
    { title: 'Curva ABC', icon: BarChart3, href: '/relatorios/curva-abc' },
    ...(isModuleEnabled('sales_campaigns')
      ? [{ title: 'Campanhas de Vendas', icon: Megaphone, href: '/campanhas' }]
      : []),
  ];

  const settings = [
    { title: 'Configurações', icon: Settings, href: '/configuracoes' },
    { title: 'Integrações', icon: Settings, href: '/configuracoes/integracoes' },
    { title: 'WhatsApp', icon: Settings, href: '/configuracoes/whatsapp' },
  ];

  const renderGroup = (label: string, items: { title: string; icon: any; href: string }[]) =>
    items.length > 0 && (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={location.pathname === item.href}>
                  <Link to={item.href}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-sm">
            <img src={logoIcon} alt="ComandaTech" className="w-8 h-8 object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-primary">ComandaTech</span>
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
              {company?.name || 'Sem empresa'}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup('Operação', [...home, ...operations])}
        {renderGroup('Catálogo', catalog)}
        {renderGroup('Financeiro', finance)}
        {renderGroup('Fiscal', fiscal)}
        {renderGroup('Relatórios', reports)}
        {renderGroup('Configurações', settings)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.full_name || 'Operador'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
