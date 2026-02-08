import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, MessageCircle } from 'lucide-react';

interface WhatsAppAutoReplyInfoProps {
  companySlug?: string;
  menuUrl?: string;
}

const GREETING_EXAMPLES = [
  'oi', 'olá', 'oie', 'bom dia', 'boa tarde', 'boa noite',
  'quero pedir', 'tem cardápio?', 'salve', 'eae',
];

export function WhatsAppAutoReplyInfo({ companySlug, menuUrl }: WhatsAppAutoReplyInfoProps) {
  const exampleUrl = menuUrl || (companySlug ? `${window.location.origin}/cardapio/${companySlug}` : 'https://seusite.com/cardapio/sua-loja');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="w-4 h-4 text-green-600" />
          Resposta automática (Saudação + Cardápio)
        </CardTitle>
        <CardDescription>
          Quando um cliente mandar uma saudação no WhatsApp, o sistema responde automaticamente com o link do cardápio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trigger examples */}
        <div>
          <p className="text-sm font-medium mb-2">Palavras que ativam a resposta:</p>
          <div className="flex flex-wrap gap-1.5">
            {GREETING_EXAMPLES.map((word) => (
              <Badge key={word} variant="secondary" className="text-xs">
                {word}
              </Badge>
            ))}
          </div>
        </div>

        {/* Example response */}
        <div>
          <p className="text-sm font-medium mb-2">Exemplo de resposta enviada:</p>
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <MessageCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <p className="text-sm text-foreground whitespace-pre-line">
                {`Olá! 👋 Bem-vindo(a) ao *Sua Lancheria*!\n\nAcesse nosso cardápio digital e faça seu pedido:\n${exampleUrl}\n\nQualquer dúvida, estamos à disposição!`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            ✅ A resposta é enviada automaticamente apenas uma vez por conversa de saudação. Mensagens que não são saudação (como perguntas sobre preço, reclamações, etc.) não geram resposta automática.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
