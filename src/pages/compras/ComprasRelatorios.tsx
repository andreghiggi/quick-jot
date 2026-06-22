import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

/**
 * Placeholder para Relatórios de Compras (sidebar "Acesso" do hub).
 * Tela real será construída em fase futura — por enquanto exibe "em breve"
 * pra refletir 1:1 a sidebar do GWeb sem prometer função inexistente.
 */
export default function ComprasRelatorios() {
  return (
    <AppLayout>
      <div className="container py-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Relatórios de Compras</h1>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
            <Construction className="w-10 h-10 opacity-60" />
            <p className="text-base">🚧 Em breve</p>
            <p className="text-xs">Esta área receberá os relatórios consolidados de compras (entradas por fornecedor, custo médio, divergências fiscais, etc).</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}