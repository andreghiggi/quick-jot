import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';

interface WhatsAppMessageTemplatesProps {
  googleReviewUrl?: string;
}

const TEMPLATE_MESSAGES = [
  {
    status: 'Confirmado',
    statusKey: 'pending',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    example: '{{nome}}, seu pedido #{{num}} foi confirmado pelo {{loja}}! Em breve começaremos a preparar. 😊',
  },
  {
    status: 'Em Preparo',
    statusKey: 'preparing',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    example: '{{nome}}, seu pedido #{{num}} já está sendo preparado com carinho pela equipe do {{loja}}. Avisaremos quando estiver pronto!',
  },
  {
    status: 'Pronto (Retirada)',
    statusKey: 'ready_pickup',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    example: '{{nome}}, seu pedido #{{num}} está pronto para retirada no {{loja}}. Estamos te esperando!',
  },
  {
    status: 'Pronto (Entrega)',
    statusKey: 'ready_delivery',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    example: '{{nome}}, seu pedido #{{num}} está prontinho e já vai sair para entrega. Fique de olho! 🛵',
  },
];

export function WhatsAppMessageTemplates({ googleReviewUrl }: WhatsAppMessageTemplatesProps) {
  const deliveredExample = googleReviewUrl
    ? `{{nome}}, seu pedido #{{num}} foi finalizado. Obrigado por escolher o {{loja}}! ⭐ Avalie nosso atendimento: ${googleReviewUrl}`
    : '{{nome}}, seu pedido #{{num}} foi finalizado. Obrigado por escolher o {{loja}}, esperamos que tenha gostado!';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-green-600" />
          Mensagens automáticas por status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground mb-4">
          Quando o status do pedido é alterado, a mensagem abaixo é enviada automaticamente para o cliente via WhatsApp (se o telefone foi informado).
        </p>
        {TEMPLATE_MESSAGES.map((tmpl) => (
          <div key={tmpl.statusKey} className="border rounded-lg p-3 space-y-2">
            <Badge className={tmpl.color}>{tmpl.status}</Badge>
            <p className="text-sm text-foreground leading-relaxed">
              {tmpl.example}
            </p>
          </div>
        ))}
        {/* Delivered message with review link */}
        <div className="border rounded-lg p-3 space-y-2">
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">Finalizado</Badge>
          <p className="text-sm text-foreground leading-relaxed">
            {deliveredExample}
          </p>
          {googleReviewUrl && (
            <p className="text-xs text-green-600 dark:text-green-400">⭐ Link de avaliação incluído na mensagem</p>
          )}
        </div>
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Variáveis:</strong> {'{{nome}}'} = primeiro nome do cliente, {'{{num}}'} = número do pedido, {'{{loja}}'} = nome do estabelecimento. As mensagens são enviadas automaticamente quando qualquer membro da equipe altera o status do pedido.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
