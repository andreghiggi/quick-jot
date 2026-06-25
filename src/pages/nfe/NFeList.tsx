import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, RefreshCw, FileText } from 'lucide-react';

type NFe = {
  id: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  status: string;
  ambiente: string | null;
  valor_total: number;
  destinatario: any;
  motivo_rejeicao: string | null;
  created_at: string;
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  autorizada: 'default',
  pendente: 'secondary',
  rejeitada: 'destructive',
  cancelada: 'outline',
};

export default function NFeList() {
  const { company } = useAuthContext();
  const [items, setItems] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!company?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('nfe_records')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [company?.id]);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6" /> NF-e (modelo 55)
            </h1>
            <p className="text-sm text-muted-foreground">
              Emissão de Nota Fiscal Eletrônica para destinatários PJ.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button asChild size="sm">
              <Link to="/nfe/nova"><Plus className="w-4 h-4 mr-2" /> Nova NF-e</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                Nenhuma NF-e emitida ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Série</th>
                      <th className="px-3 py-2">Destinatário</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Ambiente</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Emitida em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((n) => (
                      <tr key={n.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{n.numero || '—'}</td>
                        <td className="px-3 py-2">{n.serie || '—'}</td>
                        <td className="px-3 py-2">
                          {n.destinatario?.razao_social || n.destinatario?.nome || n.destinatario?.cnpj || '—'}
                        </td>
                        <td className="px-3 py-2">R$ {Number(n.valor_total).toFixed(2).replace('.', ',')}</td>
                        <td className="px-3 py-2 text-xs uppercase">{n.ambiente || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant[n.status] || 'secondary'}>{n.status}</Badge>
                          {n.motivo_rejeicao && (
                            <div className="text-xs text-destructive mt-1 max-w-xs truncate" title={n.motivo_rejeicao}>
                              {n.motivo_rejeicao}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{new Date(n.created_at).toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}