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
import { useCompanyModules } from "@/hooks/useCompanyModules";

// Pages
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Index from "./pages/Index";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Settings from "./pages/Settings";
import Menu from "./pages/Menu";
import NoCompany from "./pages/NoCompany";
import NotFound from "./pages/NotFound";
import PDVPage from "./pages/PDV";
import PaymentMethods from "./pages/PaymentMethods";
import CashRegisters from "./pages/CashRegisters";
import TablesConfig from "./pages/TablesConfig";
import Waiter from "./pages/Waiter";
import WaitersConfig from "./pages/WaitersConfig";
import POS from "./pages/POS";
import SalesReport from "./pages/SalesReport";
import WhatsAppSettings from "./pages/WhatsAppSettings";
import Changelog from "./pages/Changelog";
import Fiscal from "./pages/Fiscal";
import NFCeMonitor from "./pages/NFCeMonitor";
import Suggestions from "./pages/Suggestions";
import MenuImport from "./pages/MenuImport";
import OptionalGroups from "./pages/OptionalGroups";
import Categories from "./pages/Categories";
import Subcategories from "./pages/Subcategories";
import CustomerReport from "./pages/CustomerReport";
import ABCReport from "./pages/ABCReport";
import SalesCampaigns from "./pages/SalesCampaigns";
import PDVV2 from "./pages/PDVV2";
import { usePdvV2Enabled } from "@/hooks/usePdvV2Enabled";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import IntegrationsPage from "./pages/admin/IntegrationsPage";
import CompanyModulesPage from "./pages/admin/CompanyModulesPage";
import SuggestionsAdmin from "./pages/admin/SuggestionsAdmin";
import ResellersPage from "./pages/admin/ResellersPage";
import AdminSettings from "./pages/admin/AdminSettings";
import CampaignSettings from "./pages/admin/CampaignSettings";
import ResellerHome from "./pages/reseller/ResellerHome";
import ResellerLojas from "./pages/reseller/ResellerLojas";
import ResellerConfiguracoes from "./pages/reseller/ResellerConfiguracoes";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, isSuperAdmin, isWaiter, isReseller, company } = useAuthContext();
  const { enabled: pdvV2Enabled, loading: pdvV2Loading } = usePdvV2Enabled(company?.id);

  // Redirect logic for root path
  function RootRedirect() {
    if (loading) return null;
    
    if (!user) {
      return <Navigate to="/auth" replace />;
    }
    
    if (isSuperAdmin()) {
      return <Navigate to="/admin" replace />;
    }

    if (isReseller()) {
      return <Navigate to="/revendedor/home" replace />;
    }

    if (isWaiter()) {
      return <Navigate to="/garcom" replace />;
    }

    // PDV V2: redireciona para a nova central operacional
    if (!pdvV2Loading && pdvV2Enabled) {
      return <Navigate to="/pdv-v2" replace />;
    }
    
    return <Index />;
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/cardapio/:slug" element={<Menu />} />
      
      {/* Root with redirect logic */}
      <Route path="/" element={<RootRedirect />} />
      
      {/* Protected Routes */}
      <Route path="/pedidos" element={
        <ProtectedRoute requireCompany>
          <Orders />
        </ProtectedRoute>
      } />
      
      <Route path="/produtos" element={
        <ProtectedRoute requireCompany>
          <Products />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes" element={
        <ProtectedRoute requireCompany>
          <Settings />
        </ProtectedRoute>
      } />
      
      <Route path="/pdv" element={
        <ProtectedRoute requireCompany>
          <PDVPage />
        </ProtectedRoute>
      } />
      
      <Route path="/pos" element={
        <ProtectedRoute requireCompany>
          <POS />
        </ProtectedRoute>
      } />

      {/* PDV V2 - Nova Central Operacional (rota nova, isolada) */}
      <Route path="/pdv-v2" element={
        <ProtectedRoute requireCompany>
          <PDVV2 />
        </ProtectedRoute>
      } />
      
      <Route path="/formas-pagamento" element={
        <ProtectedRoute requireCompany>
          <PaymentMethods />
        </ProtectedRoute>
      } />
      
      <Route path="/financeiro/caixa" element={
        <ProtectedRoute requireCompany>
          <CashRegisters />
        </ProtectedRoute>
      } />
      
      <Route path="/relatorios/vendas" element={
        <ProtectedRoute requireCompany>
          <SalesReport />
        </ProtectedRoute>
      } />
      <Route path="/financeiro/relatorios" element={<Navigate to="/relatorios/vendas" replace />} />
      
      <Route path="/configuracoes/mesas" element={
        <ProtectedRoute requireCompany>
          <TablesConfig />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/garcons" element={
        <ProtectedRoute requireCompany>
          <WaitersConfig />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/whatsapp" element={
        <ProtectedRoute requireCompany>
          <WhatsAppSettings />
        </ProtectedRoute>
      } />
      
      <Route path="/fiscal" element={
        <ProtectedRoute requireCompany>
          <Fiscal />
        </ProtectedRoute>
      } />
      
      <Route path="/nfce" element={
        <ProtectedRoute requireCompany>
          <NFCeMonitor />
        </ProtectedRoute>
      } />
      
      <Route path="/novidades" element={
        <ProtectedRoute requireCompany>
          <Changelog />
        </ProtectedRoute>
      } />
      
      <Route path="/sugestoes" element={
        <ProtectedRoute requireCompany>
          <Suggestions />
        </ProtectedRoute>
      } />
      
      <Route path="/importar-cardapio" element={
        <ProtectedRoute requireCompany>
          <MenuImport />
        </ProtectedRoute>
      } />
      
      <Route path="/adicionais" element={
        <ProtectedRoute requireCompany>
          <OptionalGroups />
        </ProtectedRoute>
      } />
      
      <Route path="/categorias" element={
        <ProtectedRoute requireCompany>
          <Categories />
        </ProtectedRoute>
      } />
      
      <Route path="/subcategorias" element={
        <ProtectedRoute requireCompany>
          <Subcategories />
        </ProtectedRoute>
      } />
      
      <Route path="/relatorios/clientes" element={
        <ProtectedRoute requireCompany>
          <CustomerReport />
        </ProtectedRoute>
      } />
      
      <Route path="/relatorios/curva-abc" element={
        <ProtectedRoute requireCompany>
          <ABCReport />
        </ProtectedRoute>
      } />

      <Route path="/campanhas" element={
        <ProtectedRoute requireCompany>
          <SalesCampaigns />
        </ProtectedRoute>
      } />
      
      <Route path="/garcom" element={
        <ProtectedRoute requireCompany>
          <Waiter />
        </ProtectedRoute>
      } />
      
      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="super_admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/empresa/:companyId/modulos" element={
        <ProtectedRoute requiredRole="super_admin">
          <CompanyModulesPage />
        </ProtectedRoute>
      } />
      
      <Route path="/configuracoes/integracoes" element={
        <ProtectedRoute requireCompany>
          <IntegrationsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/revendedores" element={
        <ProtectedRoute requiredRole="super_admin">
          <ResellersPage />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/sugestoes" element={
        <ProtectedRoute requiredRole="super_admin">
          <SuggestionsAdmin />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/dados-empresa" element={
        <ProtectedRoute requiredRole="super_admin">
          <AdminSettings />
        </ProtectedRoute>
      } />

      <Route path="/admin/campanhas-config" element={
        <ProtectedRoute requiredRole="super_admin">
          <CampaignSettings />
        </ProtectedRoute>
      } />
      
      {/* Reseller Routes */}
      <Route path="/revendedor/home" element={
        <ProtectedRoute requiredRole="reseller">
          <ResellerHome />
        </ProtectedRoute>
      } />
      <Route path="/revendedor/lojas" element={
        <ProtectedRoute requiredRole="reseller">
          <ResellerLojas />
        </ProtectedRoute>
      } />
      {/* Financeiro foi embutido em /revendedor/lojas (Faturas por loja) */}
      <Route path="/revendedor/financeiro" element={<Navigate to="/revendedor/lojas" replace />} />
      <Route path="/revendedor/configuracoes" element={
        <ProtectedRoute requiredRole="reseller">
          <ResellerConfiguracoes />
        </ProtectedRoute>
      } />
      
      {/* No Company Page */}
      <Route path="/sem-empresa" element={<NoCompany />} />
      
      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppWithProviders() {
  const { isImpersonating } = useAuthContext();
  
  return (
    <OrderProvider>
      <ImpersonationBanner />
      <ImplementedSuggestionsModal />
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
