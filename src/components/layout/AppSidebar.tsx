import { Link, useLocation } from 'react-router-dom';
import { 
  ShoppingBag, 
  Package, 
  LogOut, 
  Settings,
  LayoutDashboard,
  Building2,
  Users,
  ChefHat,
  Monitor,
  CreditCard,
  Wallet,
  CircleDollarSign,
  UtensilsCrossed,
  Table2,
  Plug,
  MessageCircle,
  Receipt,
  FileText,
  ClipboardList,
  Lightbulb,
  Upload,
  Layers,
  FolderOpen,
  BarChart3,
  UserCheck,
} from 'lucide-react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
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

export function AppSidebar() {
  const location = useLocation();
  const { user, profile, company, signOut, isSuperAdmin, isWaiter, isCompanyAdmin } = useAuthContext();
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });

  // Waiter-only menu
  const waiterMenuItems = [
    {
      title: 'Mesas',
      icon: UtensilsCrossed,
      href: '/garcom',
    },
  ];

  const mainMenuItems = [
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      href: '/',
    },
    {
      title: 'Pedidos',
      icon: ShoppingBag,
      href: '/pedidos',
    },
  ];

  const catalogMenuItems = [
    {
      title: 'Categorias',
      icon: FolderOpen,
      href: '/categorias',
    },
    {
      title: 'Produtos',
      icon: Package,
      href: '/produtos',
    },
    {
      title: 'Adicionais',
      icon: Layers,
      href: '/adicionais',
    },
    {
      title: 'Ver cardápio',
      icon: ChefHat,
      href: `/cardapio/${company?.slug || ''}`,
    },
  ];

  const pdvMenuItems = isModuleEnabled('pdv') ? [
    {
      title: 'PDV',
      icon: Monitor,
      href: '/pdv',
    },
  ] : [];

  const mesasMenuItems = isModuleEnabled('mesas') && !isWaiter() ? [
    {
      title: 'Garçom',
      icon: UtensilsCrossed,
      href: '/garcom',
    },
  ] : [];

  const financeMenuItems = isModuleEnabled('pdv') ? [
    {
      title: 'Caixa',
      icon: CircleDollarSign,
      href: '/financeiro/caixa',
    },
  ] : [];

  // Formas de pagamento disponível para todas as empresas
  const paymentMethodsMenuItem = [
    {
      title: 'Formas de Pagamento',
      icon: CreditCard,
      href: '/formas-pagamento',
    },
  ];

  const mesasConfigItems = isModuleEnabled('mesas') && isCompanyAdmin() ? [
    {
      title: 'Mesas',
      icon: Table2,
      href: '/configuracoes/mesas',
    },
    {
      title: 'Garçons',
      icon: Users,
      href: '/configuracoes/garcons',
    },
  ] : [];

  const fiscalMenuItems = isModuleEnabled('fiscal') ? [
    {
      title: 'Fiscal',
      icon: Receipt,
      href: '/fiscal',
    },
    {
      title: 'NFC-e Monitor',
      icon: FileText,
      href: '/nfce',
    },
  ] : [];

  const whatsappConfigItems = [
    {
      title: 'WhatsApp',
      icon: MessageCircle,
      href: '/configuracoes/whatsapp',
    },
  ];

  const adminMenuItems = [
    {
      title: 'Empresas',
      icon: Building2,
      href: '/admin',
    },
    {
      title: 'Revendedores',
      icon: UserCheck,
      href: '/admin/revendedores',
    },
    {
      title: 'Sugestões',
      icon: Lightbulb,
      href: '/admin/sugestoes',
    },
    {
      title: 'Usuários',
      icon: Users,
      href: '/admin/usuarios',
    },
  ];

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // If user is a waiter, show simplified menu
  if (isWaiter()) {
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
          <SidebarGroup>
            <SidebarGroupLabel>Garçom</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {waiterMenuItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.href}
                    >
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
                {profile?.full_name || 'Garçom'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
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
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {pdvMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {fiscalMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {mesasMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
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

        <SidebarGroup>
          <SidebarGroupLabel>Catálogo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {catalogMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
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

        {(financeMenuItems.length > 0 || paymentMethodsMenuItem.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Financeiro</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[...financeMenuItems, ...paymentMethodsMenuItem].map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.href}
                    >
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
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Relatórios</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isModuleEnabled('pdv') && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/relatorios/vendas'}
                  >
                    <Link to="/relatorios/vendas">
                      <Wallet className="w-4 h-4" />
                      <span>Relatório de Vendas</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
              <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/relatorios/clientes'}
                >
                  <Link to="/relatorios/clientes">
                    <BarChart3 className="w-4 h-4" />
                    <span>Relatório de Clientes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/relatorios/curva-abc'}
                >
                  <Link to="/relatorios/curva-abc">
                    <BarChart3 className="w-4 h-4" />
                    <span>Curva ABC</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperAdmin() && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.href || location.pathname.startsWith(item.href + '/')}
                    >
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
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  isActive={location.pathname === '/configuracoes'}
                >
                  <Link to="/configuracoes">
                    <Settings className="w-4 h-4" />
                    <span>Configurações</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  isActive={location.pathname === '/configuracoes/integracoes'}
                >
                  <Link to="/configuracoes/integracoes">
                    <Plug className="w-4 h-4" />
                    <span>Integrações</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {mesasConfigItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {whatsappConfigItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/novidades'}
                >
                  <Link to="/novidades">
                    <ClipboardList className="w-4 h-4" />
                    <span>Novidades</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/sugestoes'}
                >
                  <Link to="/sugestoes">
                    <Lightbulb className="w-4 h-4" />
                    <span>Sugestões</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/importar-cardapio'}
                >
                  <Link to="/importar-cardapio">
                    <Upload className="w-4 h-4" />
                    <span>Importar Cardápio</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
              {profile?.full_name || 'Usuário'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
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
