import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCombos } from '@/hooks/useCombos';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Pencil, Trash2, PackagePlus, ImageIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Combos() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { combos, loading, deleteCombo, toggleActive, moveCombo } = useCombos({ companyId: company?.id });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PackagePlus className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Combos</h1>
              <p className="text-sm text-muted-foreground">
                Monte combos com produtos cadastrados. Na NFC-e, sai como kit explodido (cada item com sua tributação).
              </p>
            </div>
          </div>
          <Button onClick={() => navigate('/combos/novo')}>
            <Plus className="h-4 w-4 mr-2" /> Novo Combo
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Combos cadastrados ({combos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Carregando...</div>
            ) : combos.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                Nenhum combo cadastrado. Clique em "Novo Combo" para começar.
              </div>
            ) : (
              <div className="space-y-2">
                {combos.map((c, idx) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {c.image_url ? (
                          <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {c.name}
                          {!c.active && <Badge variant="secondary">Inativo</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)} item(ns) · R$ {c.price.toFixed(2).replace('.', ',')}
                          {c.code ? ` · ${c.code}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={idx === 0}
                          onClick={() => moveCombo(c.id, 'up')}
                          title="Mover para cima"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={idx === combos.length - 1}
                          onClick={() => moveCombo(c.id, 'down')}
                          title="Mover para baixo"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c.id, v)} />
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/combos/${c.id}`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Excluir o combo "${c.name}"?`)) deleteCombo(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}