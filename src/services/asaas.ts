/**
 * Asaas payment gateway integration (placeholder)
 * Functions will be activated when API key is configured in reseller settings.
 */

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
}

export interface AsaasBoleto {
  id: string;
  bankSlipUrl: string;
  value: number;
  dueDate: string;
  status: string;
}

export interface AsaasPixCharge {
  id: string;
  encodedImage: string; // QR code base64
  payload: string; // Pix copia-e-cola
  value: number;
  status: string;
}

export async function createCustomer(data: {
  name: string;
  email: string;
  cpfCnpj?: string;
  apiKey?: string | null;
}): Promise<AsaasCustomer> {
  console.log('Asaas integration pending — createCustomer', data.name);
  return {
    id: `cus_mock_${Date.now()}`,
    name: data.name,
    email: data.email,
    cpfCnpj: data.cpfCnpj || '',
  };
}

export async function createBoleto(data: {
  customerId: string;
  value: number;
  dueDate: string;
  description?: string;
  apiKey?: string | null;
}): Promise<AsaasBoleto> {
  console.log('Asaas integration pending — createBoleto', data.value);
  return {
    id: `pay_mock_${Date.now()}`,
    bankSlipUrl: '',
    value: data.value,
    dueDate: data.dueDate,
    status: 'PENDING',
  };
}

export async function createPixCharge(data: {
  customerId: string;
  value: number;
  description?: string;
  apiKey?: string | null;
}): Promise<AsaasPixCharge> {
  console.log('Asaas integration pending — createPixCharge', data.value);
  return {
    id: `pix_mock_${Date.now()}`,
    encodedImage: '',
    payload: '',
    value: data.value,
    status: 'PENDING',
  };
}

export async function getPaymentStatus(data: {
  paymentId: string;
  apiKey?: string | null;
}): Promise<{ id: string; status: string; paidAt?: string }> {
  console.log('Asaas integration pending — getPaymentStatus', data.paymentId);
  return {
    id: data.paymentId,
    status: 'PENDING',
  };
}
