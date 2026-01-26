import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertCircle, Printer } from 'lucide-react';
import { POSTransaction } from '@/types/pos';
import { getPaymentMethodLabel } from '@/services/posPayment';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface POSTransactionResultProps {
  transaction: POSTransaction;
  onNewTransaction: () => void;
  onPrint?: () => void;
}

export function POSTransactionResult({ transaction, onNewTransaction, onPrint }: POSTransactionResultProps) {
  const isApproved = transaction.status === 'approved';
  const isDeclined = transaction.status === 'declined';
  const isError = transaction.status === 'error';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center pb-2">
        {isApproved && (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <CardTitle className="text-green-600 text-2xl">Pagamento Aprovado!</CardTitle>
          </div>
        )}
        {isDeclined && (
          <div className="flex flex-col items-center gap-2">
            <XCircle className="h-16 w-16 text-red-500" />
            <CardTitle className="text-red-600 text-2xl">Pagamento Recusado</CardTitle>
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="h-16 w-16 text-yellow-500" />
            <CardTitle className="text-yellow-600 text-2xl">Erro no Pagamento</CardTitle>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-4xl font-bold">{formatCurrency(transaction.amount)}</p>
          <p className="text-muted-foreground">{getPaymentMethodLabel(transaction.paymentMethod)}</p>
        </div>

        <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
          {transaction.nsu && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">NSU:</span>
              <span className="font-mono">{transaction.nsu}</span>
            </div>
          )}
          {transaction.authorizationCode && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Autorização:</span>
              <span className="font-mono">{transaction.authorizationCode}</span>
            </div>
          )}
          {transaction.cardBrand && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bandeira:</span>
              <span>{transaction.cardBrand}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data/Hora:</span>
            <span>{format(transaction.processedAt || transaction.createdAt, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
          </div>
          {transaction.customerName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente:</span>
              <span>{transaction.customerName}</span>
            </div>
          )}
        </div>

        {transaction.errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {transaction.errorMessage}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        {isApproved && onPrint && (
          <Button 
            variant="outline" 
            className="w-full h-14 text-lg"
            onClick={onPrint}
          >
            <Printer className="mr-2 h-5 w-5" />
            Imprimir Comprovante
          </Button>
        )}
        <Button 
          className="w-full h-14 text-lg"
          onClick={onNewTransaction}
        >
          Nova Transação
        </Button>
      </CardFooter>
    </Card>
  );
}
