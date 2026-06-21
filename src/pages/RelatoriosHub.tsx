import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Receipt, DollarSign, Users, BarChart3, CreditCard, Package } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';

type ReportCard = {
  id: string;
  title: string;
  description: string;
  icon: typeof Receipt;
  href: string;
  filters: string[];
};

const BASE_REPORTS: ReportCard[] = [
  {
    id: 'vendas',
    title: 'Vendas',
    description: 'Faturamento, ticket médio e ranking de produtos com filtros por período e origem.',
    icon: Receipt,
    href: '/relatorios/vendas',
    filters: ['Período', 'Origem', 'Status'],
  },
  {
    id: 'caixa',
    title: 'Caixa',
    description: 'Movimentações, sangrias, suprimentos e fechamentos do caixa.',
    icon: DollarSign,
    href: '/relatorios/caixa',
    filters: ['Período', 'Operador'],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    description: 'Base de clientes, recorrência, ticket médio e histórico de pedidos.',
    icon: Users,
    href: '/relatorios/clientes',
    filters: ['Período', 'Frequência'],
  },
  {
    id: 'curva-abc',
    title: 'Curva ABC',
    description: 'Classificação ABC dos produtos por receita e quantidade vendida.',
    icon: BarChart3,
    href: '/relatorios/curva-abc',
    filters: ['Período', 'Categoria'],
  },
  {
    id: 'tef',
    title: 'Relatório TEF',
    description: 'Transações de cartão TEF (Multiplus), conferência por bandeira e adquirente.',
    icon: CreditCard,
    href: '/relatorios/tef',
    filters: ['Período', 'Bandeira', 'Adquirente'],
  },
  {
    id: 'estoque',
    title: 'Estoque',
    description: 'Posição de estoque, movimentações e itens com saldo crítico (módulo Mercado).',
    icon: Package,
    href: '/estoque',
    filters: ['Categoria', 'Saldo'],
  },
];

export default function RelatoriosHub() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const companyId = (user as any)?.user_metadata?.company_id as string | undefined;
  const { enabled: mercadoEnabled } = useMercadoEnabled(companyId);
  const [hasTef, setHasTef] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!companyId) { setHasTef(false); return; }
      const { data } = await supabase
        .from('store_settings')
        .select('key, value')
        .eq('company_id', companyId)
        .in('key', ['pinpad_tef_token', 'pinpad_tef_cnpj', 'pinpad_tef_pdv']);
      if (cancel) return;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { if (s.value) map[s.key] = s.value; });
      setHasTef(!!(map.pinpad_tef_token && map.pinpad_tef_cnpj && map.pinpad_tef_pdv));
    })();
    return () => { cancel = true; };
  }, [companyId]);

  const reports = BASE_REPORTS.filter((r) => {
    if (r.id === 'tef') return !!hasTef;
    if (r.id === 'estoque') return mercadoEnabled;
    return true;
  });

  return (
    <PDVV2Layout>
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Relatórios</h1>
            <p className="text-sm text-muted-foreground">
              Escolha o tipo de relatório que deseja visualizar. Os filtros disponíveis aparecem dentro de cada relatório.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((r) => {
              const Icon = r.icon;
              return (
                <Card
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(r.href)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(r.href); } }}
                  className="cursor-pointer transition-all hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 text-primary p-2.5">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{r.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CardDescription className="text-sm">{r.description}</CardDescription>
                    <div className="flex flex-wrap gap-1.5">
                      {r.filters.map((f) => (
                        <Badge key={f} variant="secondary" className="text-[10px] font-normal">{f}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </PDVV2Layout>
  );
}