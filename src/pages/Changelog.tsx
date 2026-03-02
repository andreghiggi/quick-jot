import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardList } from 'lucide-react';

interface ChangelogEntry {
  date: string;
  version: string;
  type: 'fix' | 'feature' | 'improvement';
  description: string;
}

const changelog: ChangelogEntry[] = [
  {
    date: '02/03/2026',
    version: '1.11.0',
    type: 'feature',
    description: 'Cardápio V2: novo layout com navegação por categorias em cards coloridos, banner do estabelecimento e imagens de fallback por categoria. Ativável em Configurações → Cardápio.',
  },
  {
    date: '27/02/2026',
    version: '1.10.1',
    type: 'fix',
    description: 'WhatsApp: cooldown de 24h para respostas automáticas — mesmo número não recebe saudação duplicada, mesmo enviando "oi", "boa noite" ou "tudo bem" várias vezes.',
  },
  {
    date: '27/02/2026',
    version: '1.10.1',
    type: 'feature',
    description: 'Notificação de sugestões implementadas: ao abrir o sistema, lojistas são notificados com um modal sobre suas sugestões que já foram concluídas.',
  },
  {
    date: '24/02/2026',
    version: '1.10.0',
    type: 'feature',
    description: 'Grupos de Adicionais: cadastro de opcionais com mínimo/máximo de seleção, vinculáveis a categorias ou produtos específicos, com importação por IA (foto ou arquivo).',
  },
  {
    date: '23/02/2026',
    version: '1.9.1',
    type: 'feature',
    description: 'Geração de Documentos: card no PDV com opções "Somente Venda" e "Venda com NFC-e" para controlar quando emitir nota fiscal.',
  },
  {
    date: '23/02/2026',
    version: '1.9.1',
    type: 'feature',
    description: 'Emissão posterior de NFC-e: vendas sem nota fiscal agora podem ter a NFC-e gerada diretamente pelo menu de vendas do caixa.',
  },
  {
    date: '23/02/2026',
    version: '1.9.1',
    type: 'improvement',
    description: 'Monitor NFC-e: botão de reprocessar agora disponível para notas pendentes, rejeitadas e com erro.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'feature',
    description: 'Sistema de Sugestões: lojistas podem enviar ideias e acompanhar o status (pendente, aprovado, implementado) com previsão de entrega.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'feature',
    description: 'Importação de Cardápio por IA: envie uma foto ou PDF do cardápio e o sistema extrai automaticamente produtos, preços e categorias com preview editável.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'improvement',
    description: 'PDV agora aguarda retorno da SEFAZ (polling) antes de oferecer impressão da NFC-e, evitando impressões de notas ainda não autorizadas.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'feature',
    description: 'Impressão automática no PDV: toggles para imprimir comprovante de venda e DANFE automaticamente ao finalizar.',
  },
  {
    date: '19/02/2026',
    version: '1.8.1',
    type: 'improvement',
    description: 'Impressão automática (script Python) agora usa layout HTML idêntico à impressão manual do painel de Pedidos, com mesmo CSS, fontes e formatação. O script também carrega automaticamente o tamanho do papel (58mm/80mm) configurado pela empresa.',
  },
  {
    date: '18/02/2026',
    version: '1.8.0',
    type: 'fix',
    description: 'Correção completa do fluxo de emissão NFC-e: substituído gatilho [F] por checkbox "Emitir NFC-e" no diálogo de pagamento, vinculação do sale_id à nota fiscal, e melhoria no feedback de erros.',
  },
  {
    date: '17/02/2026',
    version: '1.7.1',
    type: 'improvement',
    description: 'Ao enviar pedido pelo WhatsApp, cliente agora recebe um toast de confirmação e retorna automaticamente ao cardápio, eliminando risco de envio duplicado.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'feature',
    description: 'Filtro por intervalo de datas nos pedidos e dashboard, com faturamento baseado apenas em pedidos finalizados.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'fix',
    description: 'Cards de estatísticas da dashboard e pedidos agora atualizam em tempo real conforme pedidos avançam de etapa.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'feature',
    description: 'Tempo estimado de preparo configurável nas configurações do WhatsApp, enviado automaticamente ao aceitar pedido.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'feature',
    description: 'Página de Changelog (Novidades) adicionada ao menu lateral.',
  },
  {
    date: '17/02/2026',
    version: '1.6.1',
    type: 'fix',
    description: 'Relatórios de vendas agora consideram pedidos finalizados (delivered) além das vendas do PDV.',
  },
  {
    date: '17/02/2026',
    version: '1.6.1',
    type: 'fix',
    description: 'Corrigido flickering/piscar ao navegar entre menus.',
  },
  {
    date: '17/02/2026',
    version: '1.6.0',
    type: 'fix',
    description: 'Isolamento de dados por empresa: pedidos, caixas, vendas PDV e relatórios filtrados por company_id.',
  },
  {
    date: '17/02/2026',
    version: '1.6.0',
    type: 'feature',
    description: 'Códigos de pedidos agora são alfanuméricos aleatórios (ex: A123B4) ao invés de sequenciais.',
  },
  {
    date: '17/02/2026',
    version: '1.6.0',
    type: 'feature',
    description: 'Seleção de tamanho da bobina da impressora (58mm ou 80mm) nas configurações, ajustando layout de impressão.',
  },
  {
    date: '17/02/2026',
    version: '1.5.0',
    type: 'feature',
    description: 'Link de avaliação do Google na mensagem de pedido finalizado via WhatsApp.',
  },
  {
    date: '17/02/2026',
    version: '1.5.0',
    type: 'fix',
    description: 'Prevenção de pedidos duplicados no cardápio (duplo clique no botão enviar).',
  },
];

const typeBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  fix: { label: 'Correção', variant: 'secondary' },
  feature: { label: 'Novidade', variant: 'default' },
  improvement: { label: 'Melhoria', variant: 'outline' },
};

export default function Changelog() {
  return (
    <AppLayout title="Novidades">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Histórico de Atualizações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-4">
                {changelog.map((entry, i) => (
                  <div key={i} className="flex gap-3 pb-4 border-b last:border-0">
                    <div className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 w-20 shrink-0">
                      {entry.date}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={typeBadge[entry.type].variant} className="text-xs">
                          {typeBadge[entry.type].label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">v{entry.version}</span>
                      </div>
                      <p className="text-sm">{entry.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
