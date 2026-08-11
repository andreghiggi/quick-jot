import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Utilitário para acionamento da gaveta de caixa (Elgin/Bematech/Epson).
 * 
 * A gaveta é conectada via cabo RJ11 na impressora térmica.
 * O comando ESC/POS padrão para abertura é: ESC p m t1 t2
 * onde:
 *  - ESC: 27
 *  - p: 112
 *  - m: conector (0 para pino 2, 1 para pino 5)
 *  - t1: tempo ligado
 *  - t2: tempo desligado
 */

export interface DrawerSettings {
  enabled: boolean;
  model: string;
  pin: string;
  pulse: string;
}

export async function openCashDrawer(companyId: string, settings: DrawerSettings) {
  if (!settings.enabled) return;

  console.log('[CashDrawer] Iniciando abertura da gaveta...');

  // 1. Montar o comando ESC/POS
  const m = settings.pin === '5' ? 1 : 0;
  
  // Tempos t1 e t2 (em múltiplos de 2ms)
  let t1 = 25;  // 50ms
  let t2 = 250; // 500ms
  
  if (settings.pulse === 'short') {
    t1 = 15;
  } else if (settings.pulse === 'long') {
    t1 = 50;
  }

  // Comando binário ESC p m t1 t2
  const command = [27, 112, m, t1, t2];
  
  try {
    // 2. Tentar via Agente Local (Porta 8081)
    // O agente local (auto_printer.py) deve expor a rota /gaveta
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch('http://localhost:8081/gaveta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (response && response.ok) {
      console.log('[CashDrawer] Aberto via agente local');
      return;
    }

    // 3. Fallback: Gravar na print_queue com label DRAWER_PULSE
    // O agente local consome essa fila e interpreta o label especial
    console.log('[CashDrawer] Agente local indisponível, usando print_queue de fallback');
    
    const { error } = await supabase.from('print_queue').insert({
      company_id: companyId,
      label: 'DRAWER_PULSE',
      html_content: JSON.stringify({ command }),
      printed: false
    });

    if (error) {
      console.error('[CashDrawer] Erro ao inserir na print_queue:', error);
    }

  } catch (err) {
    console.error('[CashDrawer] Erro geral ao acionar gaveta:', err);
  }
}
