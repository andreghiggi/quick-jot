import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { OrderProvider } from "@/contexts/OrderContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { ImplementedSuggestionsModal } from "@/components/ImplementedSuggestionsModal";
import { TefPrintPromptDialog } from "@/components/TefPrintPromptDialog";
import { VersionBadge } from "@/components/VersionBadge";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { detectDomainContext, COMANDATECH_ROOT } from "@/utils/domainRouting";
import { Suspense, useEffect, type ReactNode } from "react";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import * as P from "./routes/lazyPages";
import { PageLoader } from "@/components/PageLoader";
import { usePdvV2Enabled } from "@/hooks/usePdvV2Enabled";
import { useMercadoEnabled } from "@/hooks/useMercadoEnabled";
import { useFinanceiroEnabled } from "@/hooks/useFinanceiroEnabled";
import { useCardapioEnabled } from "@/hooks/useCardapioEnabled";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, loading, userDataReady, isSuperAdmin, isWaiter, isReseller, company, impersonatedCompany } = useAuthContext();
  const { enabled: pdvV2Enabled, loading: pdvV2Loading } = usePdvV2Enabled(company?.id);
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { enabled: cardapioEnabled, loading: cardapioLoading } = useCardapioEnabled(company?.id);

  if (loading || (user && !userDataReady)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  // Quando super_admin/revendedor está impersonando uma loja, comporta-se como a loja.
  if (!impersonatedCompany) {
    if (isSuperAdmin()) return <Navigate to="/admin" replace />;
    if (isReseller()) return <Navigate to="/revendedor/home" replace />;
  }
  if (isWaiter()) return <Navigate to="/garcom" replace />;
  if (!pdvV2Loading && pdvV2Enabled) return <Navigate to="/pdv-v2" replace />;
  // Loja SÓ Mercado (sem Cardápio e sem PDV V2) → abre direto na Frente de Caixa.
  if (!mercadoLoading && !cardapioLoading && mercadoEnabled && !cardapioEnabled) {
    return <Navigate to="/frente-caixa" replace />;
  }

  return <P.Index />;
}

/**
 * Guard da rota /pdv-v2: bloqueia acesso quando o módulo `pdv_v2` está
 * desativado, independente de cache local ou bookmark.
 */
function PDVV2Guard({ children }: { children: ReactNode }) {
  const { company } = useAuthContext();
  const { enabled, loading } = usePdvV2Enabled(company?.id);
  if (loading) return null;
  if (!enabled) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Guard das rotas /frente-caixa/*: bloqueia acesso quando a loja não tem o
 * módulo `mercado` ativo, evitando acesso indevido via URL/bookmark.
 */
function FrenteCaixaGuard({ children }: { children: ReactNode }) {
  const { company } = useAuthContext();
  const { enabled, loading } = useMercadoEnabled(company?.id);
  if (loading) return <PageLoader />;
  if (!enabled) return <Navigate to="/pdv-v2" replace />;
  return <>{children}</>;
}

/**
 * Guard do módulo Financeiro. Bloqueia rotas do grupo Financeiro para lojas
 * sem o módulo `financeiro` ativo.
 */
function FinanceiroGuard({ children }: { children: ReactNode }) {
  const { company } = useAuthContext();
  const { enabled, loading } = useFinanceiroEnabled(company?.id);
  if (loading) return null;
  if (!enabled) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  // Detecta o contexto de domínio uma vez por render
  const domainCtx = detectDomainContext();

  // Domínio raiz comandatech.com.br → redireciona para app.comandatech.com.br
  useEffect(() => {
    if (domainCtx.kind === 'root-redirect') {
      window.location.replace(`https://app.${COMANDATECH_ROOT}${window.location.pathname}${window.location.search}`);
    }
  }, [domainCtx.kind]);

  // Quando estamos em um subdomínio de loja (ex: lancheriadai9.comandatech.com.br),
  // a rota raiz "/" deve carregar o cardápio dessa loja diretamente.
  if (domainCtx.kind === 'store') {
    return (
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/cardapio/:slug" element={<P.Menu />} />
        <Route path="/mesa/:slug" element={<P.MesaQR />} />
        {/* Rota raiz do subdomínio → cardápio da loja */}
        <Route path="/" element={<P.Menu />} />
        <Route path="*" element={<P.Menu />} />
      </Routes>
      </Suspense>
    );
  }

  // Tela em branco enquanto o redirect do domínio raiz acontece
  if (domainCtx.kind === 'root-redirect') {
    return null;
  }

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public Routes */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/cardapio/:slug" element={<P.Menu />} />
      <Route path="/mesa/:slug" element={<P.MesaQR />} />
      
      {/* Root with redirect logic */}
      <Route path="/" element={<RootRedirect />} />
      
      {/* Protected Routes */}
      <Route path="/pedidos" element={
        <ProtectedRoute requireCompany>
          <P.Orders />
        </ProtectedRoute>
      } />
      
      <Route path="/produtos" element={
        <ProtectedRoute requireCompany>
          <P.Products />
        </ProtectedRoute>
      } />
      <Route path="/produtos/novo" element={
        <ProtectedRoute requireCompany>
          <P.ProductEdit />
        </ProtectedRoute>
      } />
      <Route path="/produtos/:id" element={
        <ProtectedRoute requireCompany>
          <P.ProductEdit />
        </ProtectedRoute>
      } />

      <Route path="/cadastros/configuracoes" element={
        <ProtectedRoute requireCompany>
          <P.CadastrosConfiguracoes />
        </ProtectedRoute>
      } />

      <Route path="/configuracoes" element={
        <ProtectedRoute requireCompany>
          <P.Settings />
        </ProtectedRoute>
      } />
      
      <Route path="/pdv" element={
        <ProtectedRoute requireCompany>
          <P.PDVPage />
        </ProtectedRoute>
      } />
      
      <Route path="/pos" element={
        <ProtectedRoute requireCompany>
          <P.POS />
        </ProtectedRoute>
      } />

      {/* PDV V2 - Nova Central Operacional (rota nova, isolada) */}
      <Route path="/pdv-v2" element={
        <ProtectedRoute requireCompany>
          <PDVV2Guard>
            <P.PDVV2 />
          </PDVV2Guard>
        </ProtectedRoute>
      } />

      <Route path="/pdv-v2/comandas-historico" element={
        <ProtectedRoute requireCompany>
          <PDVV2Guard>
            <P.PDVV2ComandasHistorico />
          </PDVV2Guard>
        </ProtectedRoute>
      } />

      {/* Frente de Caixa (módulo mercado) — guard interno via useMercadoEnabled */}
      <Route path="/frente-caixa" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.FrenteCaixa />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />

      <Route path="/frente-caixa/lista" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.FrenteCaixaLista />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />

      <Route path="/frente-caixa/configuracoes" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.FrenteCaixaConfiguracoes />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />

      {/* Módulo Financeiro — Contas a Receber (Crediário) */}
      <Route path="/financeiro/contas-a-receber" element={
        <ProtectedRoute requireCompany>
          <FinanceiroGuard>
            <P.Receitas />
          </FinanceiroGuard>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/receitas" element={
        <ProtectedRoute requireCompany>
          <FinanceiroGuard>
            <P.Receitas />
          </FinanceiroGuard>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/contas-a-pagar" element={
        <ProtectedRoute requireCompany>
          <FinanceiroGuard>
            <P.Despesas />
          </FinanceiroGuard>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/despesas" element={
        <ProtectedRoute requireCompany>
          <FinanceiroGuard>
            <P.Despesas />
          </FinanceiroGuard>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/fluxo-de-caixa" element={
        <ProtectedRoute requireCompany>
          <FinanceiroGuard>
            <P.FluxoCaixa />
          </FinanceiroGuard>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/inadimplencia" element={
        <ProtectedRoute requireCompany>
          <FinanceiroGuard>
            <P.Inadimplencia />
          </FinanceiroGuard>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/receitas/relatorios" element={
        <ProtectedRoute requireCompany><FinanceiroGuard><P.ReceitasRelatorios /></FinanceiroGuard></ProtectedRoute>
      } />
      <Route path="/financeiro/receitas/configuracoes" element={
        <ProtectedRoute requireCompany><FinanceiroGuard><P.ReceitasConfiguracoes /></FinanceiroGuard></ProtectedRoute>
      } />
      <Route path="/financeiro/despesas/relatorios" element={
        <ProtectedRoute requireCompany><FinanceiroGuard><P.DespesasRelatorios /></FinanceiroGuard></ProtectedRoute>
      } />
      <Route path="/financeiro/despesas/configuracoes" element={
        <ProtectedRoute requireCompany><FinanceiroGuard><P.DespesasConfiguracoes /></FinanceiroGuard></ProtectedRoute>
      } />
      <Route path="/financeiro/planos-de-contas" element={
        <ProtectedRoute requireCompany><FinanceiroGuard><P.PlanosDeContas /></FinanceiroGuard></ProtectedRoute>
      } />
      <Route path="/financeiro/centros-de-custos" element={
        <ProtectedRoute requireCompany><FinanceiroGuard><P.CentrosDeCustos /></FinanceiroGuard></ProtectedRoute>
      } />

      {/* Estoque (módulo mercado) — guard interno via useMercadoEnabled */}
      <Route path="/estoque" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.EstoqueRelatorio />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/estoque/inventario" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.InventarioContagem />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/estoque/livro-inventario" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.InventarioLivro />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/estoque/cmv" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.InventarioCMV />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/estoque/kardex" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.InventarioKardex />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />

      {/* Compras: Manifestação Eletrônica + NF-e de Entrada (módulo mercado) */}
      <Route path="/compras" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.Compras />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/compras/manifestacao" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.DfeManifestacao />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/compras/importar-xml" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.PurchaseImportXml />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/compras/entradas" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.PurchaseInvoices />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/compras/relatorios" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.ComprasRelatorios />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/compras/configuracoes" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.ComprasConfiguracoes />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />
      <Route path="/compras/nova" element={
        <ProtectedRoute requireCompany>
          <FrenteCaixaGuard>
            <P.NovaCompra />
          </FrenteCaixaGuard>
        </ProtectedRoute>
      } />

      {/* NF-e (modelo 55) — módulo `nfe`. Isolado do fluxo NFC-e. */}
      <Route path="/nfe" element={
        <ProtectedRoute requireCompany>
          <P.NFeList />
        </ProtectedRoute>
      } />
      <Route path="/nfe/nova" element={
        <ProtectedRoute requireCompany>
          <P.NFeEmissaoAvulsa />
        </ProtectedRoute>
      } />

      <Route path="/formas-pagamento" element={
        <ProtectedRoute requireCompany>
          <P.PaymentMethods />
        </ProtectedRoute>
      } />
      
      <Route path="/financeiro/caixa" element={
        <ProtectedRoute requireCompany>
          <P.CashRegisters />
        </ProtectedRoute>
      } />
      
      <Route path="/relatorios/vendas" element={
        <ProtectedRoute requireCompany>
          <P.SalesReport />
        </ProtectedRoute>
      } />
      <Route path="/financeiro/relatorios" element={<Navigate to="/relatorios/vendas" replace />} />

      <Route path="/relatorios" element={
        <ProtectedRoute requireCompany>
          <P.RelatoriosHub />
        </ProtectedRoute>
      } />

      <Route path="/relatorios/caixa" element={
        <ProtectedRoute requireCompany>
          <P.CashReport />
        </ProtectedRoute>
      } />

      <Route path="/relatorios/tef" element={
        <ProtectedRoute requireCompany>
          <P.TefReport />
        </ProtectedRoute>
      } />

      <Route path="/tef-adm" element={
        <ProtectedRoute requireCompany>
          <P.TefAdm />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/mesas" element={
        <ProtectedRoute requireCompany>
          <P.TablesConfig />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/garcons" element={
        <ProtectedRoute requireCompany>
          <P.WaitersConfig />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/whatsapp" element={
        <ProtectedRoute requireCompany>
          <P.WhatsAppSettings />
        </ProtectedRoute>
      } />
      
      <Route path="/fiscal" element={
        <ProtectedRoute requireCompany>
          <P.Fiscal />
        </ProtectedRoute>
      } />
      
      <Route path="/nfce" element={
        <ProtectedRoute requireCompany>
          <P.NFCeMonitor />
        </ProtectedRoute>
      } />

      <Route path="/fiscal/espelho" element={
        <ProtectedRoute requireCompany>
          <P.EspelhoFiscal />
        </ProtectedRoute>
      } />
      
      <Route path="/novidades" element={
        <ProtectedRoute requireCompany>
          <P.Changelog />
        </ProtectedRoute>
      } />
      
      <Route path="/sugestoes" element={
        <ProtectedRoute requireCompany>
          <P.Suggestions />
        </ProtectedRoute>
      } />
      
      <Route path="/importar-cardapio" element={
        <ProtectedRoute requireCompany>
          <P.MenuImport />
        </ProtectedRoute>
      } />
      
      <Route path="/adicionais" element={
        <ProtectedRoute requireCompany>
          <P.OptionalGroups />
        </ProtectedRoute>
      } />

      <Route path="/combos" element={
        <ProtectedRoute requireCompany>
          <P.Combos />
        </ProtectedRoute>
      } />

      <Route path="/combos/novo" element={
        <ProtectedRoute requireCompany>
          <P.ComboEdit />
        </ProtectedRoute>
      } />

      <Route path="/combos/:id" element={
        <ProtectedRoute requireCompany>
          <P.ComboEdit />
        </ProtectedRoute>
      } />
      
      <Route path="/categorias" element={
        <ProtectedRoute requireCompany>
          <P.Categories />
        </ProtectedRoute>
      } />
      
      <Route path="/subcategorias" element={
        <ProtectedRoute requireCompany>
          <P.Subcategories />
        </ProtectedRoute>
      } />
      
      <Route path="/relatorios/clientes" element={
        <ProtectedRoute requireCompany>
          <P.CustomerReport />
        </ProtectedRoute>
      } />

      <Route path="/clientes" element={
        <ProtectedRoute requireCompany>
          <P.Customers />
        </ProtectedRoute>
      } />

      <Route path="/fornecedores" element={
        <ProtectedRoute requireCompany>
          <P.Suppliers />
        </ProtectedRoute>
      } />
      
      <Route path="/relatorios/curva-abc" element={
        <ProtectedRoute requireCompany>
          <P.ABCReport />
        </ProtectedRoute>
      } />

      <Route path="/campanhas" element={
        <ProtectedRoute requireCompany>
          <P.SalesCampaigns />
        </ProtectedRoute>
      } />

      <Route path="/cupons" element={
        <ProtectedRoute requireCompany>
          <P.CouponsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/garcom" element={
        <ProtectedRoute requireCompany>
          <P.Waiter />
        </ProtectedRoute>
      } />
      
      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.AdminDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/empresa/:companyId/modulos" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.CompanyModulesPage />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/integracoes" element={
        <ProtectedRoute requireCompany>
          <P.IntegrationsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/revendedores" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.ResellersPage />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/sugestoes" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.SuggestionsAdmin />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/dados-empresa" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.AdminSettings />
        </ProtectedRoute>
      } />

      <Route path="/admin/campanhas-config" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.CampaignSettings />
        </ProtectedRoute>
      } />

      <Route path="/admin/midia-kit" element={
        <ProtectedRoute requiredRole="super_admin">
          <P.MediaKitAdmin />
        </ProtectedRoute>
      } />

      {/* Reseller Routes */}
      <Route path="/revendedor/home" element={
        <ProtectedRoute requiredRole="reseller">
          <P.ResellerHome />
        </ProtectedRoute>
      } />
      <Route path="/revendedor/lojas" element={
        <ProtectedRoute requiredRole="reseller">
          <P.ResellerLojas />
        </ProtectedRoute>
      } />
      {/* Financeiro foi embutido em /revendedor/lojas (Faturas por loja) */}
      <Route path="/revendedor/financeiro" element={<Navigate to="/revendedor/lojas" replace />} />
      <Route path="/revendedor/configuracoes" element={
        <ProtectedRoute requiredRole="reseller">
          <P.ResellerConfiguracoes />
        </ProtectedRoute>
      } />
      <Route path="/revendedor/midia-kit" element={
        <ProtectedRoute requiredRole="reseller">
          <P.ResellerMediaKit />
        </ProtectedRoute>
      } />
      
      {/* No Company Page */}
      <Route path="/sem-empresa" element={<P.NoCompany />} />
      
      {/* Catch-all */}
      <Route path="*" element={<P.NotFound />} />
    </Routes>
    </Suspense>
  );
}

function AppWithProviders() {
  const { isImpersonating } = useAuthContext();
  
  return (
    <OrderProvider>
      <ImpersonationBanner />
      <ImplementedSuggestionsModal />
      <TefPrintPromptDialog />
      <VersionBadge />
      {/* Add padding when impersonation banner is shown */}
      <div className={isImpersonating ? 'pt-12' : ''}>
        <AppRoutes />
      </div>
    </OrderProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppWithProviders />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
