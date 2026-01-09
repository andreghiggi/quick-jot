import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { OrderProvider } from "@/contexts/OrderContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Pages
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Settings from "./pages/Settings";
import Menu from "./pages/Menu";
import NoCompany from "./pages/NoCompany";
import NotFound from "./pages/NotFound";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, isSuperAdmin } = useAuthContext();

  // Redirect logic for root path
  function RootRedirect() {
    if (loading) return null;
    
    if (!user) {
      return <Navigate to="/auth" replace />;
    }
    
    if (isSuperAdmin()) {
      return <Navigate to="/admin" replace />;
    }
    
    return <Index />;
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/cardapio" element={<Menu />} />
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
      
      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="super_admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/empresa/:companyId" element={
        <ProtectedRoute requiredRole="super_admin">
          <Index />
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
  return (
    <OrderProvider>
      <AppRoutes />
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
