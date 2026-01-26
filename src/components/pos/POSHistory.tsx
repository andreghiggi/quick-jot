import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';
import { POSTransaction } from '@/types/pos';
import { getPaymentMethodLabel } from '@/services/posPayment';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, Cloud, CloudOff } from 'lucide-react';

interface POSHistoryProps {
  open: boolean;
  onClose: () => void;
  transactions: POSTransaction[];
}

export function POSHistory({ open, onClose, transactions }: POSHistoryProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusIcon = (status: POSTransaction['status']) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'declined':
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: POSTransaction['status']) => {
    switch (status) {
      case 'approved':
        return 'Aprovado';
      case 'declined':
        return 'Recusado';
      case 'error':
        return 'Erro';
      case 'processing':
        return 'Processando';
      case 'pending':
        return 'Pendente';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico de Transações</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma transação encontrada
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {transactions.map((tx) => (
                <div 
                  key={tx.localId} 
                  className="bg-muted/50 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(tx.status)}
                      <span className="font-semibold">{formatCurrency(tx.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getPaymentMethodLabel(tx.paymentMethod)}</Badge>
                      {tx.syncedAt ? (
                        <Cloud className="h-4 w-4 text-green-500" />
                      ) : (
                        <CloudOff className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span>{getStatusLabel(tx.status)}</span>
                    </div>
                    {tx.cardBrand && (
                      <div className="flex justify-between">
                        <span>Bandeira:</span>
                        <span>{tx.cardBrand}</span>
                      </div>
                    )}
                    {tx.nsu && (
                      <div className="flex justify-between">
                        <span>NSU:</span>
                        <span className="font-mono">{tx.nsu}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Data:</span>
                      <span>{format(tx.createdAt, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                    </div>
                    {tx.customerName && (
                      <div className="flex justify-between">
                        <span>Cliente:</span>
                        <span>{tx.customerName}</span>
                      </div>
                    )}
                  </div>

                  {tx.errorMessage && (
                    <div className="text-xs text-red-500 bg-red-50 rounded p-2">
                      {tx.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
