// POS Types for Payment Terminal App

export type PaymentMethod = 'credit' | 'debit' | 'pix';
export type TransactionStatus = 'pending' | 'processing' | 'approved' | 'declined' | 'error' | 'cancelled';

export interface POSOperator {
  id: string;
  name: string;
  email: string;
  companyId: string;
}

export interface POSTransaction {
  id: string;
  localId: string; // Local UUID for offline-first
  companyId: string;
  operatorId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  nsu?: string; // Número Sequencial Único
  authorizationCode?: string;
  cardBrand?: string;
  cardLastDigits?: string;
  tabId?: string; // Optional link to tab
  orderId?: string; // Optional link to order
  customerName?: string;
  createdAt: Date;
  processedAt?: Date;
  syncedAt?: Date;
  errorMessage?: string;
}

export interface POSConfig {
  merchantId: string;
  terminalId: string;
  acquirer: 'stone' | 'pagseguro' | 'cielo' | 'vero' | 'sicredi' | 'simulator';
}

export interface PaymentRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  installments?: number;
  customerName?: string;
  tabId?: string;
  orderId?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLastDigits?: string;
  errorCode?: string;
  errorMessage?: string;
}
