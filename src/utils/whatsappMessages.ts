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
  customTemplates?: Record<string, string>;
  menuLink?: string;
  resumo?: string;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  // Convert literal \n sequences (stored as two chars: backslash + n) to real newlines
  result = result.replace(/\\n/g, '\n');
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  // Clean up empty variable placeholders (e.g. {{tempo}} when no time set)
  result = result.replace(/\s*Tempo estimado:\s*\.\s*/g, ' ');
  result = result.replace(/\s*em aproximadamente\s*\.\s*/g, '. ');
  // Clean up multiple consecutive spaces (but preserve newlines)
  result = result.replace(/[^\S\n]{2,}/g, ' ');
  // Clean up more than 2 consecutive newlines
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

export function generateWhatsAppMessage(params: MessageParams): string | null {
  const { customerName, orderNumber, orderCode, status, storeName, estimatedTime, deliveryType, storeAddress, customTemplates, menuLink, googleReviewUrl, resumo } = params;
  const num = orderCode ? `#${orderCode}` : `#${String(orderNumber).padStart(3, '0')}`;
  const name = customerName.split(' ')[0];

  const vars: Record<string, string> = {
    '{{nome}}': name,
    '{{num}}': num,
    '{{loja}}': storeName,
    '{{tempo}}': estimatedTime || '',
    '{{endereco}}': storeAddress || '',
    '{{google_review}}': googleReviewUrl || '',
    '{{link_cardapio}}': menuLink || '',
    '{{resumo}}': resumo || '',
  };

  // Determine which template key to use
  let templateKey: string;
  switch (status) {
    case 'pending':
      templateKey = 'whatsapp_msg_pending';
      break;
    case 'preparing':
      templateKey = 'whatsapp_msg_preparing';
      break;
    case 'ready':
      templateKey = deliveryType === 'entrega' ? 'whatsapp_msg_ready_delivery' : 'whatsapp_msg_ready_pickup';
      break;
    case 'delivered':
      templateKey = 'whatsapp_msg_delivered';
      break;
    default:
      return null;
  }

  // Check for custom template
  const customTemplate = customTemplates?.[templateKey];
  if (customTemplate) {
    return applyTemplate(customTemplate, vars);
  }

  // Default messages (original logic)
  switch (status) {
    case 'pending':
      if (deliveryType === 'retirada') {
        return `*${name}, seu pedido ${num} foi confirmado!* Avisaremos quando estiver pronto para retirada. 😊`;
      }
      return `*${name}, seu pedido ${num} foi confirmado!* Em breve vamos começar preparar seu pedido e vamos te atualizando por aqui! 😊`;

    case 'preparing':
      const timeInfo = estimatedTime ? ` *Tempo estimado:* ${estimatedTime}.` : '';
      if (deliveryType === 'retirada') {
        return `${name}, seu pedido ${num} já está sendo preparado com carinho pela equipe do ${storeName}.${timeInfo} Avisaremos quando estiver disponível para retirada!`;
      }
      return `${name}, seu pedido ${num} já está sendo preparado com carinho pela equipe do ${storeName}.${timeInfo} Avisaremos quando estiver pronto!`;

    case 'ready':
      if (deliveryType === 'entrega') {
        return `*${name}, seu pedido ${num} ficou pronto e está indo até você.* Fique de olho! 🛵`;
      }
      return `${name}, seu pedido ${num} está pronto e disponível para retirada no ${storeName}!${storeAddress ? `\n📍 Endereço: ${storeAddress}` : ''}\nEstamos te esperando! 🏪`;

    case 'delivered':
      if (deliveryType === 'retirada') {
        if (params.googleReviewUrl) {
          return `*${name}, seu pedido ${num} foi concluído com sucesso.* Obrigado por escolher o ${storeName}!\n\n*Clique no link abaixo e compartilhe conosco como foi sua experiência:*\n${params.googleReviewUrl}\n\n*Para os próximos pedidos anote o nosso link:*\n${menuLink}`;
        }
        return `*${name}, seu pedido ${num} foi concluído com sucesso.* Obrigado por escolher o ${storeName}, esperamos que tenha gostado!\n\n*Para os próximos pedidos anote o nosso link:*\n${menuLink}`;
      }
      if (params.googleReviewUrl) {
        return `*${name}, seu pedido ${num} foi concluído com sucesso.* Obrigado por escolher o ${storeName}!\n\n*Clique no link abaixo e compartilhe conosco como foi sua experiência:*\n${params.googleReviewUrl}\n\n*Para os próximos pedidos anote o nosso link:*\n${menuLink}`;
      }
      return `*${name}, seu pedido ${num} foi concluído com sucesso.* Obrigado por escolher o ${storeName}, esperamos que tenha gostado!\n\n*Para os próximos pedidos anote o nosso link:*\n${menuLink}`;

    default:
      return null;
  }
}
