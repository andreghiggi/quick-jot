import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, LogOut, ShoppingBag } from 'lucide-react';

export default function NoCompany() {
  const { profile, signOut } = useAuthContext();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>
          <CardTitle>Sem Empresa Vinculada</CardTitle>
          <CardDescription>
            Olá, {profile?.full_name || profile?.email}! Sua conta ainda não está vinculada a nenhuma empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Entre em contato com o administrador do sistema para solicitar acesso a uma empresa.
          </p>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
