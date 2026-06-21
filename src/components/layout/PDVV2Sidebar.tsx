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
  Settings2,
  Users,
  UtensilsCrossed,
  Table as TableIcon,
  ScanBarcode,
  Boxes,
  Ticket,
  Truck,
  FolderTree,
  History,
  ChevronDown,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

  const home = [{ title: 'PDV', icon: Monitor, href: '/pdv-v2' }];
  const operations = [
    { title: 'Pedidos', icon: ShoppingBag, href: '/pedidos' },
    { title: 'Comandas', icon: History, href: '/pdv-v2/comandas-historico' },
    ...(isModuleEnabled('mercado')
      ? [{ title: 'Frente de Caixa', icon: ScanBarcode, href: '/frente-caixa' }]
      : []),
  ];

  const tables = isModuleEnabled('mesas')
    ? [
        { title: 'Garçom', icon: UtensilsCrossed, href: '/garcom' },
        { title: 'Mesas', icon: TableIcon, href: '/configuracoes/mesas' },
        { title: 'Garçons', icon: Users, href: '/configuracoes/garcons' },
      ]
    : [];

  const catalog = [
    { title: 'Categorias', icon: FolderOpen, href: '/categorias' },
    { title: 'Subcategorias', icon: LayoutList, href: '/subcategorias' },
    { title: 'Produtos', icon: Package, href: '/produtos' },
    { title: 'Adicionais', icon: Layers, href: '/adicionais' },
    ...(isModuleEnabled('mercado')
      ? [{ title: 'Estoque', icon: Boxes, href: '/estoque' }]
      : []),
  ];

  const people = [
    { title: 'Clientes', icon: Users, href: '/clientes' },
    { title: 'Fornecedores', icon: Truck, href: '/fornecedores' },
  ];

  const salesActions = [
    { title: 'Cupons', icon: Ticket, href: '/cupons' },
    ...(isModuleEnabled('sales_campaigns')
      ? [{ title: 'Campanhas de Vendas', icon: Megaphone, href: '/campanhas' }]
      : []),
    { title: 'Ver cardápio', icon: ChefHat, href: `/cardapio/${company?.slug || ''}` },
  ];

  const finance = [
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
    { title: 'Relatório de Caixa', icon: CircleDollarSign, href: '/relatorios/caixa' },
    { title: 'Relatório de Clientes', icon: BarChart3, href: '/relatorios/clientes' },
    { title: 'Curva ABC', icon: BarChart3, href: '/relatorios/curva-abc' },
    { title: 'Relatório TEF', icon: CreditCard, href: '/relatorios/tef' },
    ...(isModuleEnabled('mercado')
      ? [{ title: 'Relatório de Estoque', icon: Package, href: '/estoque' }]
      : []),
  ];

  const settings = [
    { title: 'Configurações', icon: Settings, href: '/configuracoes' },
    { title: 'Integrações', icon: Settings, href: '/configuracoes/integracoes' },
    { title: 'TEF ADM (Manutenção)', icon: Settings2, href: '/tef-adm' },
    { title: 'WhatsApp', icon: Settings, href: '/configuracoes/whatsapp' },
  ];

  const renderGroup = (
    label: string,
    items: { title: string; icon: any; href: string }[],
    collapsible: boolean = true,
  ) => {
    if (items.length === 0) return null;
    const menu = (
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
    );
    if (!collapsible) {
      return (
        <SidebarGroup>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SidebarGroupContent>{menu}</SidebarGroupContent>
        </SidebarGroup>
      );
    }
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return (
      <Collapsible className={`group/grp-${slug}`}>
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
              <span>{label}</span>
              <ChevronDown className={`ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-${slug}:rotate-180`} />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>{menu}</SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

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
        {renderGroup('Operação', [...home, ...operations], false)}
        {renderGroup('Mesas', tables)}
        <Collapsible className="group/grp-cadastros">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                <span>Cadastros</span>
                <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-cadastros:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible className="group/cadastros-produtos">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <Package className="w-4 h-4" />
                          <span>Produtos</span>
                          <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/cadastros-produtos:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="pl-2">
                          {catalog.map((item) => (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton asChild isActive={location.pathname === item.href}>
                                <Link to={item.href}>
                                  <item.icon className="w-4 h-4" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                  <Collapsible className="group/cadastros-pessoas">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <Users className="w-4 h-4" />
                          <span>Pessoas</span>
                          <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/cadastros-pessoas:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="pl-2">
                          {people.map((item) => (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton asChild isActive={location.pathname === item.href}>
                                <Link to={item.href}>
                                  <item.icon className="w-4 h-4" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
        {renderGroup('Ações de vendas', salesActions)}
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
