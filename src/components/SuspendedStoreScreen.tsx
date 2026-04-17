import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Ban, Lock, LogOut } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';

interface Props {
  companyName?: string;
  resellerPhone?: string | null;
  resellerName?: string | null;
  licenseStatus?: string;
  blockReason?: string | null;
  blockMessage?: string | null;
}

export function SuspendedStoreScreen({
  companyName,
  resellerPhone,
  resellerName,
  licenseStatus = 'active',
  blockReason,
  blockMessage,
}: Props) {
  const { signOut } = useAuthContext();

  const isCanceled = licenseStatus === 'canceled';
  const isManuallyBlocked = licenseStatus === 'blocked';

  const title = isCanceled
    ? 'Licença cancelada'
    : isManuallyBlocked
      ? 'Acesso bloqueado pelo revendedor'
      : 'Loja bloqueada por inadimplência';

  const Icon = isCanceled ? Ban : isManuallyBlocked ? Lock : AlertTriangle;

  const whatsappLink = resellerPhone
    ? `https://wa.me/55${resellerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! A loja ${companyName ?? ''} está com acesso bloqueado. Preciso regularizar.`
      )}`
    : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full border-destructive/50">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <Icon className="w-7 h-7 text-destructive" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCanceled ? (
            <p className="text-sm text-muted-foreground text-center">
              A licença da loja <span className="font-semibold">{companyName ?? 'sua loja'}</span> foi
              cancelada. Para reativar o acesso, entre em contato com seu revendedor.
            </p>
          ) : isManuallyBlocked ? (
            <>
              <p className="text-sm text-muted-foreground text-center">
                O acesso ao sistema da loja <span className="font-semibold">{companyName ?? 'sua loja'}</span> foi
                bloqueado pelo revendedor.
              </p>
              {(blockReason || blockMessage) && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
                  {blockReason && (
                    <p><span className="font-semibold">Motivo:</span> {blockReason}</p>
                  )}
                  {blockMessage && (
                    <p className="text-muted-foreground">{blockMessage}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              O acesso ao sistema da loja <span className="font-semibold">{companyName ?? 'sua loja'}</span>{' '}
              foi temporariamente suspenso porque a mensalidade está com mais de 3 dias de atraso.
            </p>
          )}

          {!isCanceled && (
            <p className="text-sm text-center">
              Para regularizar e liberar o acesso, entre em contato com{' '}
              <span className="font-semibold">{resellerName || 'seu revendedor'}</span>:
            </p>
          )}

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
