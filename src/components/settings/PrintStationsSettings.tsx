import { useState } from 'react';
import { usePrintStations } from '@/hooks/usePrintStations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Printer, Plus, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';

interface PrintStationsSettingsProps {
  companyId?: string | null;
}

export function PrintStationsSettings({ companyId }: PrintStationsSettingsProps) {
  const { stations, loading, addStation, updateStation, deleteStation } = usePrintStations(companyId);
  const [newName, setNewName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const ok = await addStation(newName.trim());
    if (ok) {
      setNewName('');
      toast.success('Estação criada');
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="w-5 h-5" />
          Estações de impressão
          <Badge variant="secondary">Multi-impressora (beta)</Badge>
        </CardTitle>
        <CardDescription>
          Crie estações lógicas (Cozinha, Bar, Caixa) e mapeie categorias em Cadastros → Categorias.
          Na extensão Chrome deste PC, associe cada estação à impressora Windows física.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da estação (ex.: Cozinha)"
            onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
          />
          <Button onClick={() => void handleAdd()} disabled={!newName.trim()}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando estações...</p>
        ) : stations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma estação configurada — comandas saem na impressora padrão (comportamento atual).
          </p>
        ) : (
          <ul className="space-y-3">
            {stations.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-[120px]">
                  <div className="font-medium flex items-center gap-2">
                    {s.name}
                    {s.isDefault && (
                      <Badge variant="outline" className="text-xs">
                        <Star className="w-3 h-3 mr-1" />
                        Padrão
                      </Badge>
                    )}
                    {s.handlesReceipt && (
                      <Badge variant="secondary" className="text-xs">
                        Caixa / Recibo
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`default-${s.id}`} className="text-xs whitespace-nowrap">
                    Padrão
                  </Label>
                  <Switch
                    id={`default-${s.id}`}
                    checked={s.isDefault}
                    onCheckedChange={(v) => void updateStation(s.id, { isDefault: v })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`receipt-${s.id}`} className="text-xs whitespace-nowrap">
                    Recibo
                  </Label>
                  <Switch
                    id={`receipt-${s.id}`}
                    checked={s.handlesReceipt}
                    onCheckedChange={(v) => void updateStation(s.id, { handlesReceipt: v })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${s.id}`} className="text-xs whitespace-nowrap">
                    Ativa
                  </Label>
                  <Switch
                    id={`active-${s.id}`}
                    checked={s.active}
                    onCheckedChange={(v) => void updateStation(s.id, { active: v })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => void deleteStation(s.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Extensão local: carregue a pasta <code className="text-xs">extension/</code> em{' '}
          <code className="text-xs">chrome://extensions</code> (modo desenvolvedor). Veja{' '}
          <code className="text-xs">docs/MULTI-IMPRESSORA-LOCAL.md</code>.
        </p>
      </CardContent>
    </Card>
  );
}
