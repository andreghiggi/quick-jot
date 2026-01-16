import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTables } from '@/hooks/useTables';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Trash2, 
  Users, 
  Loader2,
  Table as TableIcon,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';

export default function TablesConfig() {
  const { company } = useAuth();
  const { 
    tables, 
    loading, 
    createTables, 
    updateTableStatus,
    updateTableCapacity,
    deleteTable 
  } = useTables({ companyId: company?.id });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [tableCount, setTableCount] = useState('1');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<typeof tables[0] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddTables = async () => {
    const count = parseInt(tableCount);
    if (isNaN(count) || count < 1) {
      toast.error('Informe uma quantidade válida');
      return;
    }

    setIsProcessing(true);
    await createTables(count);
    setIsProcessing(false);
    setAddDialogOpen(false);
    setTableCount('1');
  };

  const handleEditTable = (table: typeof tables[0]) => {
    setSelectedTable(table);
    setEditDialogOpen(true);
  };

  const handleUpdateStatus = async (status: 'available' | 'occupied' | 'reserved') => {
    if (!selectedTable) return;
    setIsProcessing(true);
    await updateTableStatus(selectedTable.id, status);
    setIsProcessing(false);
    setEditDialogOpen(false);
  };

  const handleUpdateCapacity = async (capacity: number) => {
    if (!selectedTable) return;
    await updateTableCapacity(selectedTable.id, capacity);
  };

  const handleDeleteTable = async () => {
    if (!selectedTable) return;
    setIsProcessing(true);
    await deleteTable(selectedTable.id);
    setIsProcessing(false);
    setEditDialogOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'occupied': return 'bg-red-500';
      case 'reserved': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return 'Disponível';
      case 'occupied': return 'Ocupada';
      case 'reserved': return 'Reservada';
      default: return status;
    }
  };

  if (loading) {
    return (
      <AppLayout title="Configuração de Mesas">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="Configuração de Mesas"
      actions={
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Mesas
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{tables.length}</p>
                </div>
                <TableIcon className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Disponíveis</p>
                  <p className="text-2xl font-bold text-green-600">
                    {tables.filter(t => t.status === 'available').length}
                  </p>
                </div>
                <div className="w-4 h-4 rounded-full bg-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ocupadas</p>
                  <p className="text-2xl font-bold text-red-600">
                    {tables.filter(t => t.status === 'occupied').length}
                  </p>
                </div>
                <div className="w-4 h-4 rounded-full bg-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Reservadas</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {tables.filter(t => t.status === 'reserved').length}
                  </p>
                </div>
                <div className="w-4 h-4 rounded-full bg-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tables Grid */}
        {tables.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TableIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma mesa cadastrada</h3>
              <p className="text-muted-foreground mb-4">
                Adicione mesas para começar a usar o controle de mesas
              </p>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Mesas
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {tables.map((table) => (
              <Card 
                key={table.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleEditTable(table)}
              >
                <CardContent className="p-4 text-center">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(table.status)} mx-auto mb-2`} />
                  <p className="text-2xl font-bold mb-1">Mesa {table.number}</p>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" />
                    {table.capacity} lugares
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {getStatusLabel(table.status)}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Tables Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Mesas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quantidade de mesas a adicionar</Label>
              <Input
                type="number"
                min="1"
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                placeholder="Ex: 10"
              />
              <p className="text-sm text-muted-foreground">
                As mesas serão numeradas a partir de {tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddTables} disabled={isProcessing}>
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Mesa {selectedTable?.number}
            </DialogTitle>
          </DialogHeader>
          {selectedTable && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={selectedTable.status}
                  onValueChange={(value) => handleUpdateStatus(value as 'available' | 'occupied' | 'reserved')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Disponível</SelectItem>
                    <SelectItem value="occupied">Ocupada</SelectItem>
                    <SelectItem value="reserved">Reservada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Capacidade (lugares)</Label>
                <Input
                  type="number"
                  min="1"
                  value={selectedTable.capacity}
                  onChange={(e) => handleUpdateCapacity(parseInt(e.target.value) || 4)}
                />
              </div>

              <div className="pt-4 border-t">
                <Button 
                  variant="destructive" 
                  className="w-full gap-2"
                  onClick={handleDeleteTable}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Remover Mesa
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
