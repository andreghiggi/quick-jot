import { OrderStatus } from '@/types/order';

interface MessageParams {
  customerName: string;
  orderNumber: number;
  status: OrderStatus;
  storeName: string;
  estimatedTime?: string;
  deliveryType?: 'retirada' | 'entrega';
  googleReviewUrl?: string;
}

const STATUS_MAP: Record<OrderStatus, string> = {
  pending: 'confirmado',
  preparing: 'em_preparo',
  ready: 'pronto',
  delivered: 'finalizado',
};

export function generateWhatsAppMessage(params: MessageParams): string | null {
  const { customerName, orderNumber, status, storeName, estimatedTime, deliveryType } = params;
  const num = `#${String(orderNumber).padStart(3, '0')}`;
  const name = customerName.split(' ')[0]; // First name only

  switch (status) {
    case 'pending':
      return `${name}, seu pedido ${num} foi confirmado pelo ${storeName}! Em breve começaremos a preparar. 😊`;

    case 'preparing':
      return `${name}, seu pedido ${num} já está sendo preparado com carinho pela equipe do ${storeName}. Avisaremos quando estiver pronto!`;

    case 'ready':
      if (deliveryType === 'entrega') {
        return `${name}, seu pedido ${num} está prontinho e já vai sair para entrega${estimatedTime ? ` em aproximadamente ${estimatedTime}` : ''}. Fique de olho! 🛵`;
      }
      return `${name}, seu pedido ${num} está pronto para retirada no ${storeName}. Estamos te esperando!`;

    case 'delivered':
      if (params.googleReviewUrl) {
        return `${name}, seu pedido ${num} foi finalizado. Obrigado por escolher o ${storeName}! ⭐ Avalie nosso atendimento: ${params.googleReviewUrl}`;
      }
      return `${name}, seu pedido ${num} foi finalizado. Obrigado por escolher o ${storeName}, esperamos que tenha gostado!`;

    default:
      return null;
  }
}
