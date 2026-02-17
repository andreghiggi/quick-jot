import { OrderStatus } from '@/types/order';

interface MessageParams {
  customerName: string;
  orderNumber: number;
  orderCode?: string;
  status: OrderStatus;
  storeName: string;
  estimatedTime?: string;
  deliveryType?: 'retirada' | 'entrega';
  googleReviewUrl?: string;
  storeAddress?: string;
}

const STATUS_MAP: Record<OrderStatus, string> = {
  pending: 'confirmado',
  preparing: 'em_preparo',
  ready: 'pronto',
  delivered: 'finalizado',
};

export function generateWhatsAppMessage(params: MessageParams): string | null {
  const { customerName, orderNumber, orderCode, status, storeName, estimatedTime, deliveryType, storeAddress } = params;
  const num = orderCode ? `#${orderCode}` : `#${String(orderNumber).padStart(3, '0')}`;
  const name = customerName.split(' ')[0]; // First name only

  switch (status) {
    case 'pending':
      if (deliveryType === 'retirada') {
        return `${name}, seu pedido ${num} foi confirmado pelo ${storeName}! Avisaremos quando estiver pronto para retirada. 😊`;
      }
      return `${name}, seu pedido ${num} foi confirmado pelo ${storeName}! Em breve começaremos a preparar. 😊`;

    case 'preparing':
      if (deliveryType === 'retirada') {
        return `${name}, seu pedido ${num} já está sendo preparado com carinho pela equipe do ${storeName}. Avisaremos quando estiver disponível para retirada!`;
      }
      return `${name}, seu pedido ${num} já está sendo preparado com carinho pela equipe do ${storeName}. Avisaremos quando estiver pronto!`;

    case 'ready':
      if (deliveryType === 'entrega') {
        return `${name}, seu pedido ${num} está prontinho e já vai sair para entrega${estimatedTime ? ` em aproximadamente ${estimatedTime}` : ''}. Fique de olho! 🛵`;
      }
      return `${name}, seu pedido ${num} está pronto e disponível para retirada no ${storeName}!${storeAddress ? `\n📍 Endereço: ${storeAddress}` : ''}\nEstamos te esperando! 🏪`;

    case 'delivered':
      if (deliveryType === 'retirada') {
        if (params.googleReviewUrl) {
          return `${name}, seu pedido ${num} foi retirado com sucesso. Obrigado por escolher o ${storeName}! ⭐ Avalie nosso atendimento: ${params.googleReviewUrl}`;
        }
        return `${name}, seu pedido ${num} foi retirado com sucesso. Obrigado por escolher o ${storeName}, esperamos que tenha gostado!`;
      }
      if (params.googleReviewUrl) {
        return `${name}, seu pedido ${num} foi finalizado. Obrigado por escolher o ${storeName}! ⭐ Avalie nosso atendimento: ${params.googleReviewUrl}`;
      }
      return `${name}, seu pedido ${num} foi finalizado. Obrigado por escolher o ${storeName}, esperamos que tenha gostado!`;

    default:
      return null;
  }
}
