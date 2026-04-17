import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, LogOut } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';

interface Props {
  companyName?: string;
  resellerPhone?: string | null;
  resellerName?: string | null;
}

export function SuspendedStoreScreen({ companyName, resellerPhone, resellerName }: Props) {
  const { signOut } = useAuthContext();

  const whatsappLink = resellerPhone
    ? `https://wa.me/55${resellerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! A loja ${companyName ?? ''} está bloqueada por mensalidade em atraso. Preciso liberar o acesso.`
      )}`
    : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full border-destructive/50">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <CardTitle className="text-xl">Loja bloqueada por inadimplência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            O acesso ao sistema da loja <span className="font-semibold">{companyName ?? 'sua loja'}</span>{' '}
            foi temporariamente suspenso porque a mensalidade está com mais de 3 dias de atraso.
          </p>
          <p className="text-sm text-center">
            Para regularizar e liberar o acesso, entre em contato com{' '}
            <span className="font-semibold">{resellerName || 'seu revendedor'}</span>:
          </p>
          {whatsappLink ? (
            <Button asChild className="w-full" size="lg">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                Falar pelo WhatsApp
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground text-center italic">
              Contato do revendedor não cadastrado.
            </p>
          )}
          <Button variant="outline" className="w-full gap-2" onClick={() => signOut()}>
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
