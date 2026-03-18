import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  CircleDollarSign,
  Lock,
  Unlock,
  Printer,
  Eye,
  Calendar,
  Clock,
  TrendingUp,
  AlertCircle,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export default function CashRegisters() {
  const { user, company } = useAuthContext();
  const { settings: storeSettings } = useStoreSettings({ companyId: company?.id });
  const { 
    currentRegister, 
    registers,
    loading, 
    totalSales,
    salesCount,
    openRegister, 
    closeRegister, 
    reopenRegister
  } = useCashRegister({ companyId: company?.id });

  // Dialog states
  const [openRegisterDialog, setOpenRegisterDialog] = useState(false);
  const [closeRegisterDialog, setCloseRegisterDialog] = useState(false);
  const [viewRegisterDialog, setViewRegisterDialog] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState<typeof registers[0] | null>(null);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  async function handleOpenRegister() {
    if (!user) return;
    
    const amount = parseFloat(openingAmount) || 0;
    await openRegister(amount, user.id);
    setOpenRegisterDialog(false);
    setOpeningAmount('');
  }

  async function handleCloseRegister() {
    if (!currentRegister || !user) return;
    
    const amount = parseFloat(closingAmount) || 0;
    await closeRegister(amount, user.id, closingNotes || undefined);
    setCloseRegisterDialog(false);
    setClosingAmount('');
    setClosingNotes('');
  }

  async function handleReopenRegister(registerId: string) {
    await reopenRegister(registerId);
    toast.success('Caixa reaberto com sucesso!');
  }

  function handleViewRegister(register: typeof registers[0]) {
    setSelectedRegister(register);
    setViewRegisterDialog(true);
  }

  function printClosingSummary(register: typeof registers[0]) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const formattedOpenDate = register.opened_at 
      ? new Date(register.opened_at).toLocaleString('pt-BR', { 
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '-';
    
    const formattedCloseDate = register.closed_at 
      ? new Date(register.closed_at).toLocaleString('pt-BR', { 
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '-';

    const totalVendas = register.expected_amount ? register.expected_amount - register.opening_amount : 0;
    const diferenca = register.difference || 0;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Fechamento de Caixa</title>
        <style>
          @page { margin: 0; size: ${storeSettings.printerPaperSize} auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 12px;
            width: ${storeSettings.printerPaperSize};
            padding: 3mm;
          }
          .header { text-align: center; margin-bottom: 2mm; }
          .header h1 { font-size: 14px; font-weight: bold; }
          .header h2 { font-size: 16px; font-weight: bold; margin: 2mm 0; }
          .header p { font-size: 10px; }
          .divider { border-top: 1px dashed #000; margin: 2mm 0; }
          .section { margin: 2mm 0; }
          .row { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 11px; }
          .row.bold { font-weight: bold; font-size: 12px; }
          .row.total { font-size: 13px; font-weight: bold; margin: 2mm 0; }
          .row.negative { color: #c00; }
          .notes { font-size: 10px; margin: 2mm 0; }
          .footer { text-align: center; font-size: 9px; margin-top: 3mm; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${company?.name || 'EMPRESA'}</h1>
          <h2>FECHAMENTO DE CAIXA</h2>
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row"><span>Abertura:</span><span>${formattedOpenDate}</span></div>
          <div class="row"><span>Fechamento:</span><span>${formattedCloseDate}</span></div>
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row"><span>Valor Inicial:</span><span>R$ ${register.opening_amount.toFixed(2)}</span></div>
          <div class="row"><span>Total em Vendas:</span><span>R$ ${totalVendas.toFixed(2)}</span></div>
        </div>
        <div class="divider"></div>
        <div class="section">
          <div class="row bold"><span>VALOR ESPERADO:</span><span>R$ ${(register.expected_amount || 0).toFixed(2)}</span></div>
          <div class="row"><span>Valor Informado:</span><span>R$ ${(register.closing_amount || 0).toFixed(2)}</span></div>
          <div class="row total ${diferenca < 0 ? 'negative' : ''}">
            <span>DIFERENÇA:</span>
            <span>R$ ${diferenca.toFixed(2)}</span>
          </div>
        </div>
        ${register.notes ? `<div class="divider"></div><p class="notes"><strong>Obs:</strong> ${register.notes}</p>` : ''}
        <div class="divider"></div>
        <p class="footer">Impresso em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  if (loading) {
    return (
      <AppLayout title="Caixa">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Gestão de Caixa">
      <div className="space-y-6">
        {/* Status atual */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={currentRegister ? 'border-green-500/50 bg-green-50/50' : 'border-muted'}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${currentRegister ? 'bg-green-100' : 'bg-muted'}`}>
                    {currentRegister ? (
                      <Unlock className="w-5 h-5 text-green-600" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Status do Caixa</p>
                    <p className={`text-sm ${currentRegister ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {currentRegister ? 'Caixa Aberto' : 'Caixa Fechado'}
                    </p>
                  </div>
                </div>
                {!currentRegister ? (
                  <Button onClick={() => setOpenRegisterDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Abrir Caixa
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => setCloseRegisterDialog(true)}>
                    <Lock className="w-4 h-4 mr-2" />
                    Fechar Caixa
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {currentRegister && (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <TrendingUp className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Vendas Hoje</p>
                      <p className="text-2xl font-bold">{salesCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <DollarSign className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total em Vendas</p>
                      <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Histórico de Caixas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5" />
              Histórico de Caixas
            </CardTitle>
            <CardDescription>
              Visualize todos os caixas abertos e fechados
            </CardDescription>
          </CardHeader>
          <CardContent>
            {registers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum caixa registrado ainda.</p>
                <p className="text-sm">Abra seu primeiro caixa para começar.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Abertura</TableHead>
                    <TableHead>Fechamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor Inicial</TableHead>
                    <TableHead className="text-right">Valor Final</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registers.map((register) => (
                    <TableRow key={register.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {register.opened_at ? format(new Date(register.opened_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          {register.opened_at ? format(new Date(register.opened_at), 'HH:mm', { locale: ptBR }) : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {register.closed_at ? format(new Date(register.closed_at), 'HH:mm', { locale: ptBR }) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={register.status === 'open' ? 'default' : 'secondary'}>
                          {register.status === 'open' ? 'Aberto' : 'Fechado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(register.opening_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {register.closing_amount !== null ? formatCurrency(register.closing_amount) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {register.difference !== null ? (
                          <span className={register.difference < 0 ? 'text-destructive' : register.difference > 0 ? 'text-green-600' : ''}>
                            {formatCurrency(register.difference)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleViewRegister(register)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {register.status === 'closed' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => printClosingSummary(register)}>
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReopenRegister(register.id)}>
                                <Unlock className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog - Abrir Caixa */}
      <Dialog open={openRegisterDialog} onOpenChange={setOpenRegisterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Caixa</DialogTitle>
            <DialogDescription>
              Informe o valor inicial para abertura do caixa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor Inicial (R$)</Label>
              <Input
                type="number"
                placeholder="0,00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRegisterDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleOpenRegister}>
              Abrir Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog - Fechar Caixa */}
      <Dialog open={closeRegisterDialog} onOpenChange={setCloseRegisterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
            <DialogDescription>
              Confira os valores e informe o valor em caixa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between">
                <span>Valor Inicial:</span>
                <span className="font-medium">{formatCurrency(currentRegister?.opening_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total em Vendas:</span>
                <span className="font-medium">{formatCurrency(totalSales)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Valor Esperado:</span>
                <span>{formatCurrency((currentRegister?.opening_amount || 0) + totalSales)}</span>
              </div>
            </div>
            <div>
              <Label>Valor Informado (R$)</Label>
              <Input
                type="number"
                placeholder="0,00"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações sobre o fechamento..."
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseRegisterDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCloseRegister}>
              Fechar Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog - Visualizar Caixa */}
      <Dialog open={viewRegisterDialog} onOpenChange={setViewRegisterDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Caixa</DialogTitle>
            <DialogDescription>
              {selectedRegister?.opened_at && format(new Date(selectedRegister.opened_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>
          {selectedRegister && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Abertura</p>
                    <p className="font-medium">
                      {selectedRegister.opened_at ? format(new Date(selectedRegister.opened_at), 'HH:mm', { locale: ptBR }) : '-'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Fechamento</p>
                    <p className="font-medium">
                      {selectedRegister.closed_at ? format(new Date(selectedRegister.closed_at), 'HH:mm', { locale: ptBR }) : '-'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor Inicial:</span>
                    <span>{formatCurrency(selectedRegister.opening_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Vendas:</span>
                    <span>{formatCurrency((selectedRegister.expected_amount || 0) - selectedRegister.opening_amount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>Valor Esperado:</span>
                    <span>{formatCurrency(selectedRegister.expected_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor Informado:</span>
                    <span>{selectedRegister.closing_amount !== null ? formatCurrency(selectedRegister.closing_amount) : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Diferença:</span>
                    <span className={
                      selectedRegister.difference 
                        ? selectedRegister.difference < 0 
                          ? 'text-destructive font-medium' 
                          : selectedRegister.difference > 0 
                            ? 'text-green-600 font-medium' 
                            : ''
                        : ''
                    }>
                      {selectedRegister.difference !== null ? formatCurrency(selectedRegister.difference) : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {selectedRegister.notes && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                    <p>{selectedRegister.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedRegister?.status === 'closed' && (
              <Button variant="outline" onClick={() => printClosingSummary(selectedRegister)}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
            )}
            <Button onClick={() => setViewRegisterDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
