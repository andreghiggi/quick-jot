import { useState } from 'react';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Store, Clock, AlertTriangle, DollarSign, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ResellerHome() {
  const { companies, stats, loading } = useResellerPortal();
  const [showMRR, setShowMRR] = useState(true);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Recent activity: last 10 companies sorted by creation date
  const recentCompanies = [...companies]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  // Upcoming expirations
  const upcomingExpirations = companies
    .filter(c => c.plan?.expires_at && c.plan?.active)
    .sort((a, b) => new Date(a.plan!.expires_at!).getTime() - new Date(b.plan!.expires_at!).getTime())
    .slice(0, 5);

  return (
    <ResellerLayout title="Home">
      <div className="space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Lojas Ativas</CardTitle>
              <Store className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalActive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Lojas em Trial</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTrial}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Lojas Inadimplentes</CardTitle>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalExpired}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">MRR</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowMRR(!showMRR)}
              >
                {showMRR ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {showMRR
                  ? `R$ ${stats.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '••••••'}
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent stores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lojas Recentes</CardTitle>
              <CardDescription>Últimas lojas cadastradas</CardDescription>
            </CardHeader>
            <CardContent>
              {recentCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma loja cadastrada</p>
              ) : (
                <div className="space-y-3">
                  {recentCompanies.map(c => (
                    <div key={c.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <Badge variant={c.plan?.active ? 'default' : 'secondary'}>
                        {c.plan?.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming expirations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próximas Expirações</CardTitle>
              <CardDescription>Trials próximos do vencimento</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingExpirations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma expiração próxima</p>
              ) : (
                <div className="space-y-3">
                  {upcomingExpirations.map(c => {
                    const expiresAt = new Date(c.plan!.expires_at!);
                    const isExpired = expiresAt < new Date();
                    return (
                      <div key={c.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Expira: {format(expiresAt, "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge variant={isExpired ? 'destructive' : 'outline'}>
                          {isExpired ? 'Expirado' : 'Em breve'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ResellerLayout>
  );
}
