import { useEffect, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePdvSettings } from '@/hooks/usePdvSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Settings2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function CadastrosConfiguracoes() {
  const { company } = useAuthContext();
  const { settings, loading, saving, save } = usePdvSettings(company?.id);
  const [autoGen, setAutoGen] = useState(false);
  const [extra, setExtra] = useState<{ auto_generate_gtin?: boolean } | null>(null);

  // Lê auto_generate_gtin diretamente (ainda não está tipado no hook)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company?.id) return;
      const { data } = await supabase
        .from('pdv_settings')
        .select('auto_generate_gtin')
        .eq('company_id', company.id)
        .maybeSingle();
      if (!cancelled) {
        const v = !!(data as any)?.auto_generate_gtin;
        setAutoGen(v);
        setExtra({ auto_generate_gtin: v });
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  async function handleSave() {
    if (!company?.id) return;
    // Salva apenas a flag adicional, preservando o restante via upsert
    const { error } = await supabase
      .from('pdv_settings')
      .upsert(
        { company_id: company.id, auto_generate_gtin: autoGen } as any,
        { onConflict: 'company_id' },
      );
    if (error) {
      toast.error('Erro ao salvar', { description: error.message });
      return;
    }
    setExtra({ auto_generate_gtin: autoGen });
    toast.success('Configuração salva');
  }

  const dirty = extra ? extra.auto_generate_gtin !== autoGen : autoGen;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Configurações de Cadastros</h1>
          <p className="text-sm text-muted-foreground">
            Comportamentos automáticos ao cadastrar produtos e itens
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Códigos de barras (GTIN)</CardTitle>
          <CardDescription>
            Regras para geração automática de código de barras nos produtos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor="auto-gtin" className="text-base">
                    Gerar código GTIN automaticamente ao salvar produto
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Quando ligado, todo produto salvo sem GTIN recebe um EAN-13
                    interno (prefixo <strong>2</strong>, faixa GS1 reservada para
                    uso interno da loja). Útil para bipar produtos de fabricação
                    própria ou sem código do fornecedor.
                  </p>
                </div>
                <Switch
                  id="auto-gtin"
                  checked={autoGen}
                  onCheckedChange={setAutoGen}
                />
              </div>

              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Importante (fiscal)</p>
                  <p>
                    Os códigos gerados são <strong>apenas para uso interno</strong>{' '}
                    (PDV / Frente de Caixa). A NFC-e continua sendo emitida{' '}
                    <strong>SEM GTIN</strong> quando o produto não tem código
                    GS1 real — nenhum código artificial é enviado ao SEFAZ.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={!dirty || saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}