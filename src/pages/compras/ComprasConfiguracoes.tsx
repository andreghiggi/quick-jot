import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

/**
 * Placeholder para Configurações de Compras (sidebar do hub).
 * Sem regra real ainda — apenas mantém a paridade visual com o GWeb.
 */
export default function ComprasConfiguracoes() {
  return (
    <AppLayout>
      <div className="container py-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Configurações de Compras</h1>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
            <Construction className="w-10 h-10 opacity-60" />
            <p className="text-base">🚧 Em breve</p>
            <p className="text-xs">Aqui você vai configurar naturezas de operação, contas de pagamento padrão e regras de entrada.</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}