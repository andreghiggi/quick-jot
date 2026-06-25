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
  LayoutList,
  FolderOpen,
  BarChart3,
  UserCheck,
  Megaphone,
  Settings2,
  ChevronDown,
  Ticket,
  Truck,
  ClipboardEdit,
  ScanBarcode,
  PackagePlus,
  ShoppingCart,
  FileCheck,
  FileInput,
} from 'lucide-react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePdvV2Enabled } from '@/hooks/usePdvV2Enabled';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useCardapioEnabled } from '@/hooks/useCardapioEnabled';
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

export function AppSidebar() {
  const location = useLocation();
  const { user, profile, company, signOut, isSuperAdmin, isWaiter, isCompanyAdmin } = useAuthContext();
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const { enabled: pdvV2Enabled } = usePdvV2Enabled(company?.id);
  const { enabled: mercadoEnabled } = useMercadoEnabled(company?.id);
  const { enabled: cardapioEnabled } = useCardapioEnabled(company?.id);
  // Perfil "só Mercado": esconde Pedidos, Cardápio, Mesas, Cupons, Combos,
  // Adicionais, Subcategorias e WhatsApp Ordering. Mantém Frente de Caixa,
  // Produtos, Estoque, Clientes, Fornecedores, Caixa, Fiscal e Relatórios.
  const mercadoOnly = mercadoEnabled && !cardapioEnabled;

  // Waiter-only menu
  const waiterMenuItems = [
    {
      title: 'Mesas',
      icon: UtensilsCrossed,
      href: '/garcom',
    },
  ];

  const mainMenuItems = [
    mercadoOnly
      ? {
          title: 'Frente de Caixa',
          icon: ScanBarcode,
          href: '/frente-caixa',
        }
      : pdvV2Enabled
      ? {
          title: 'PDV',
          icon: Monitor,
          href: '/pdv-v2',
        }
      : {
          title: 'Dashboard',
          icon: LayoutDashboard,
          href: '/',
        },
  ];

  // Movimentações (estilo GWeb): apenas Frente de Caixa · Compras
  const movimentacoesItems = [
    ...(mercadoEnabled && !mercadoOnly
      ? [{ title: 'Frente de Caixa', icon: ScanBarcode, href: '/frente-caixa' }]
      : []),
    ...(mercadoEnabled
      ? [{ title: 'Compras', icon: ShoppingCart, href: '/compras' }]
      : []),
  ];

  // Cadastros - bloco Produtos
  const cadastrosProdutosItems = [
    ...(mercadoOnly ? [] : [
      { title: 'Categorias', icon: FolderOpen, href: '/categorias' },
      { title: 'Subcategorias', icon: LayoutList, href: '/subcategorias' },
    ]),
    { title: 'Produtos', icon: Package, href: '/produtos' },
    ...(mercadoOnly ? [] : [
      { title: 'Adicionais', icon: Layers, href: '/adicionais' },
      { title: 'Combos', icon: PackagePlus, href: '/combos' },
    ]),
    ...(mercadoEnabled
      ? [{ title: 'Estoque', icon: ClipboardEdit, href: '/estoque' }]
      : []),
  ];

  // Cadastros - bloco Pessoas
  const cadastrosPessoasItems = [
    { title: 'Clientes', icon: Users, href: '/clientes' },
    { title: 'Fornecedores', icon: Truck, href: '/fornecedores' },
  ];

  // Cadastros - bloco Configurações (visível só para admin da empresa)
  const cadastrosConfigItems = isCompanyAdmin() ? [
    { title: 'Configurações', icon: Settings2, href: '/cadastros/configuracoes' },
  ] : [];

  // Ações de vendas
  const acoesVendasItems = mercadoOnly ? [] : [
    { title: 'Cupons', icon: Ticket, href: '/cupons' },
    ...(isModuleEnabled('sales_campaigns')
      ? [{ title: 'Campanhas de Vendas', icon: Megaphone, href: '/campanhas' }]
      : []),
    { title: 'Ver cardápio', icon: ChefHat, href: `/cardapio/${company?.slug || ''}` },
  ];

  // Itens top-level: Pedidos, Comandas, PDV legado (fora de Movimentações)
  const pdvMenuItems: { title: string; icon: any; href: string }[] = [
    ...(mercadoOnly ? [] : [{ title: 'Pedidos', icon: ShoppingBag, href: '/pedidos' }]),
    ...(pdvV2Enabled && !mercadoOnly && isModuleEnabled('mesas')
      ? [{ title: 'Comandas', icon: ClipboardEdit, href: '/pdv-v2/comandas-historico' }]
      : []),
    ...(isModuleEnabled('pdv') && !pdvV2Enabled && !mercadoOnly
      ? [{ title: 'PDV', icon: Monitor, href: '/pdv' }]
      : []),
  ];

  const mesasMenuItems = isModuleEnabled('mesas') && !isWaiter() && !mercadoOnly ? [
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

  const mesasConfigItems = isModuleEnabled('mesas') && isCompanyAdmin() && !mercadoOnly ? [
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

  // O grupo "Compras" foi removido — agora há um único link "Compras" dentro de Movimentações
  // que abre o hub `/compras` (com sidebar GWeb: Manifestação, Importar XML, XML do mês).

  const whatsappConfigItems = mercadoOnly ? [] : [
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
    {
      title: 'Dados da Empresa',
      icon: FileText,
      href: '/admin/dados-empresa',
    },
    {
      title: 'Campanhas (config)',
      icon: Megaphone,
      href: '/admin/campanhas-config',
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {movimentacoesItems.length > 0 && (
          <Collapsible
            className="group/grp-mov"
            defaultOpen={movimentacoesItems.some(i => location.pathname === i.href || location.pathname.startsWith(i.href + '/'))}
          >
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                  <span>Movimentações</span>
                  <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-mov:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {movimentacoesItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={
                            item.href === '/compras'
                              ? location.pathname.startsWith('/compras')
                              : location.pathname === item.href
                          }
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

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
                              {cadastrosProdutosItems.map((item) => (
                                <SidebarMenuSubItem key={item.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={location.pathname === item.href}
                                  >
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
                              {cadastrosPessoasItems.map((item) => (
                                <SidebarMenuSubItem key={item.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={location.pathname === item.href}
                                  >
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
                      {cadastrosConfigItems.map((item) => (
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
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {acoesVendasItems.length > 0 && (
        <Collapsible className="group/grp-acoes">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                <span>Ações de vendas</span>
                <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-acoes:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {acoesVendasItems.map((item) => (
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
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
        )}

        {(mesasMenuItems.length > 0 || mesasConfigItems.length > 0) && (
          <Collapsible className="group/grp-salao">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                  <span>Salão</span>
                  <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-salao:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
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
                {mesasConfigItems.length > 0 && (
                  <Collapsible
                    defaultOpen={mesasConfigItems.some(i => location.pathname === i.href)}
                    className="group/salao-config"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <Settings className="w-4 h-4" />
                          <span>Configurações</span>
                          <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/salao-config:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {mesasConfigItems.map((item) => (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location.pathname === item.href}
                              >
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
                )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {(financeMenuItems.length > 0 || paymentMethodsMenuItem.length > 0) && (
          <Collapsible className="group/grp-fin">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                  <span>Financeiro</span>
                  <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-fin:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {fiscalMenuItems.length > 0 && (
          <Collapsible className="group/grp-fiscal">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                  <span>Fiscal</span>
                  <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-fiscal:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {fiscalMenuItems.map((item) => (
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        <Collapsible className="group/grp-rel">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                <span>Relatórios</span>
                <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-rel:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
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
              {isModuleEnabled('pdv_v2') && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/relatorios/caixa'}
                  >
                    <Link to="/relatorios/caixa">
                      <CircleDollarSign className="w-4 h-4" />
                      <span>Relatório de Caixa</span>
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/relatorios/tef'}
                >
                  <Link to="/relatorios/tef">
                    <CreditCard className="w-4 h-4" />
                    <span>Relatório TEF</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {mercadoEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/estoque'}
                  >
                    <Link to="/estoque">
                      <Package className="w-4 h-4" />
                      <span>Relatório de Estoque</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {isSuperAdmin() && (
          <Collapsible className="group/grp-adm">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                  <span>Administração</span>
                  <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-adm:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        <Collapsible className="group/grp-cfg">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center cursor-pointer bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80">
                <span>Configurações</span>
                <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/grp-cfg:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/tef-adm'}
                >
                  <Link to="/tef-adm">
                    <Settings2 className="w-4 h-4" />
                    <span>TEF ADM (Manutenção)</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
              {!mercadoOnly && (
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
              )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
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
