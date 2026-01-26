// Payment service abstraction for POS
// This will be replaced with actual SDK integration (Stone, PagSeguro, Cielo)

import { PaymentRequest, PaymentResponse, PaymentMethod } from '@/types/pos';

export interface PaymentSDK {
  initialize(): Promise<void>;
  processPayment(request: PaymentRequest): Promise<PaymentResponse>;
  cancelPayment(transactionId: string): Promise<boolean>;
  isAvailable(): boolean;
}

// Simulator for development/testing
class PaymentSimulator implements PaymentSDK {
  private initialized = false;

  async initialize(): Promise<void> {
    // Simulate initialization delay
    await new Promise(resolve => setTimeout(resolve, 500));
    this.initialized = true;
    console.log('[POS] Payment simulator initialized');
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    if (!this.initialized) {
      return {
        success: false,
        errorCode: 'NOT_INITIALIZED',
        errorMessage: 'SDK não inicializado',
      };
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate 90% success rate
    const isSuccess = Math.random() > 0.1;

    if (isSuccess) {
      const nsu = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const authCode = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      
      return {
        success: true,
        transactionId: `SIM-${Date.now()}`,
        nsu,
        authorizationCode: authCode,
        cardBrand: request.paymentMethod === 'pix' ? 'PIX' : ['VISA', 'MASTERCARD', 'ELO'][Math.floor(Math.random() * 3)],
        cardLastDigits: request.paymentMethod === 'pix' ? undefined : '****',
      };
    } else {
      return {
        success: false,
        errorCode: 'DECLINED',
        errorMessage: 'Transação recusada pelo emissor',
      };
    }
  }

  async cancelPayment(transactionId: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  isAvailable(): boolean {
    return this.initialized;
  }
}

// TODO: Implement actual SDKs
// class StoneSDK implements PaymentSDK { ... }
// class PagSeguroSDK implements PaymentSDK { ... }
// class CieloSDK implements PaymentSDK { ... }

let currentSDK: PaymentSDK | null = null;

export async function initializePaymentSDK(acquirer: 'stone' | 'pagseguro' | 'cielo' | 'simulator' = 'simulator'): Promise<void> {
  switch (acquirer) {
    case 'stone':
      // TODO: Initialize Stone SDK via Capacitor plugin
      console.warn('[POS] Stone SDK not implemented, using simulator');
      currentSDK = new PaymentSimulator();
      break;
    case 'pagseguro':
      // TODO: Initialize PagSeguro SDK via Capacitor plugin
      console.warn('[POS] PagSeguro SDK not implemented, using simulator');
      currentSDK = new PaymentSimulator();
      break;
    case 'cielo':
      // TODO: Initialize Cielo SDK via Capacitor plugin
      console.warn('[POS] Cielo SDK not implemented, using simulator');
      currentSDK = new PaymentSimulator();
      break;
    case 'simulator':
    default:
      currentSDK = new PaymentSimulator();
      break;
  }

  await currentSDK.initialize();
}

export function getPaymentSDK(): PaymentSDK {
  if (!currentSDK) {
    throw new Error('Payment SDK not initialized. Call initializePaymentSDK first.');
  }
  return currentSDK;
}

export async function processPayment(request: PaymentRequest): Promise<PaymentResponse> {
  return getPaymentSDK().processPayment(request);
}

export function isPaymentAvailable(): boolean {
  return currentSDK?.isAvailable() ?? false;
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'credit':
      return 'Crédito';
    case 'debit':
      return 'Débito';
    case 'pix':
      return 'PIX';
    default:
      return method;
  }
}
