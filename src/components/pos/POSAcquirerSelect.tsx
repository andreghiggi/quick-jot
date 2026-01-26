import { useState, useEffect } from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { AcquirerType, getAvailableAcquirers } from '@/services/posPayment';

interface POSAcquirerSelectProps {
  value: AcquirerType;
  onChange: (value: AcquirerType) => void;
  disabled?: boolean;
}

export function POSAcquirerSelect({ value, onChange, disabled }: POSAcquirerSelectProps) {
  const acquirers = getAvailableAcquirers();

  const getAcquirerInfo = (acquirer: AcquirerType) => {
    switch (acquirer) {
      case 'vero':
        return {
          description: 'Banco Banrisul - RS',
          status: 'beta',
          notes: 'Requer app Vero instalado no POS',
        };
      case 'sicredi':
        return {
          description: 'Cooperativa de Crédito',
          status: 'beta',
          notes: 'Utiliza plataforma GetNet',
        };
      case 'stone':
        return {
          description: 'Adquirente Stone',
          status: 'ready',
          notes: 'Plugin Capacitor disponível',
        };
      case 'pagseguro':
        return {
          description: 'PagBank/PagSeguro',
          status: 'ready',
          notes: 'SDK SmartPOS',
        };
      case 'cielo':
        return {
          description: 'Cielo LIO',
          status: 'ready',
          notes: 'SDK LIO disponível',
        };
      case 'simulator':
        return {
          description: 'Modo de teste',
          status: 'ready',
          notes: 'Simula transações para desenvolvimento',
        };
      default:
        return {
          description: '',
          status: 'unknown',
          notes: '',
        };
    }
  };

  const info = getAcquirerInfo(value);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Adquirente
          {info.status === 'beta' && (
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          )}
        </CardTitle>
        <CardDescription>Selecione a operadora de pagamentos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={value} onValueChange={(v) => onChange(v as AcquirerType)} disabled={disabled}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {acquirers.map((acq) => (
              <SelectItem key={acq.value} value={acq.value}>
                {acq.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {value && (
          <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">{info.description}</p>
            <p className="text-muted-foreground text-xs">{info.notes}</p>
            <div className="flex items-center gap-1 mt-2">
              {info.status === 'ready' ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600">Pronto para uso</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 text-yellow-500" />
                  <span className="text-xs text-yellow-600">Em desenvolvimento</span>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
