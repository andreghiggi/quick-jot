import { useState, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Hook para interagir com o serviço local de balança (auto_printer.py).
 * O serviço local deve rodar um servidor HTTP na porta 8081.
 */
export function useScale() {
  const [reading, setReading] = useState(false);

  const getWeight = useCallback(async (): Promise<number | null> => {
    setReading(true);
    try {
      // Tenta ler o peso do serviço local
      const response = await fetch('http://localhost:8081/peso', {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // Timeout de 3 segundos
      });

      if (!response.ok) {
        throw new Error('Serviço de balança não respondeu corretamente');
      }

      const data = await response.json();
      
      if (typeof data.peso === 'number') {
        return data.peso;
      }
      
      return null;
    } catch (error) {
      console.error('[Scale] Error reading weight:', error);
      toast.error('Não foi possível ler o peso da balança. Verifique se o script local está rodando.');
      return null;
    } finally {
      setReading(false);
    }
  }, []);

  return {
    getWeight,
    reading,
  };
}
