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
    date: '17/04/2026',
    version: '1.26.9',
    type: 'fix',
    description: 'Impressão automática v8.19: corrigida a caixa do cabeçalho que não saía no pedido principal e eliminadas as folhas em branco extras. A página só é iniciada quando há conteúdo real para imprimir e a margem inferior de corte não força mais nova página.',
  },
  {
    date: '16/04/2026',
    version: '1.26.8',
    type: 'fix',
    description: 'Rei do Açaí: a comanda de produção do cardápio online volta a sair com os acompanhamentos/adicionais escolhidos, preservando o nome completo do item enviado para impressão.',
  },
  {
    date: '15/04/2026',
    version: '1.26.7',
    type: 'fix',
    description: 'Impressão automática v7.0: restaurado método original do domingo (webbrowser.open + window.print) que funcionava corretamente. Adicionada fila de impressão para mesas. Sem mudanças experimentais.',
  },
  {
    date: '15/04/2026',
    version: '1.26.6',
    type: 'fix',
    description: 'Impressão automática v6.2: headless PDF volta como método principal (rundll32 retornava sucesso falso). Cadeia de impressão: PDF→PowerShell silencioso→SumatraPDF→os.startfile. Scripts removidos do HTML.',
  },
  {
    date: '15/04/2026',
    version: '1.26.5',
    type: 'fix',
    description: 'Impressão automática v6.1: corrigido problema que abria o navegador e imprimia papel gigante. Agora usa rundll32 silencioso como principal, fallback com PDF + PowerShell oculto. Scripts de impressão removidos do HTML. Tamanho 58mm/80mm respeitado.',
  },
  {
    date: '15/04/2026',
    version: '1.26.4',
    type: 'fix',
    description: 'Impressão automática v6.0: corrigida ordem dos métodos — headless PDF agora é o principal, rundll32 apenas como fallback. Resolve problema de impressões que não saíam.',
  },
  {
    date: '15/04/2026',
    version: '1.26.3',
    type: 'improvement',
    description: 'Impressão automática v5.9: modo silencioso (sem abrir navegador no PC) aplicado para todas as lojas da base, não apenas piloto. Impressão de mesas e cardápio mantida sem alterações.',
  },
  {
    date: '15/04/2026',
    version: '1.26.2',
    type: 'fix',
    description: 'Impressão local (piloto Lancheria da i9): nova tentativa silenciosa nativa do Windows para HTML antes do modo headless, além de remover logs DEBUG e pontinhos do terminal preto.',
  },
  {
    date: '15/04/2026',
    version: '1.26.1',
    type: 'fix',
    description: 'Impressão local (piloto Lancheria da i9): removido o fallback que abria o navegador no PC quando a impressão silenciosa falhava; agora o script tenta somente o fluxo silencioso e registra erro no log.',
  },
  {
    date: '10/04/2026',
    version: '1.26.0',
    type: 'feature',
    description: 'Pedido Express, badges de Aberto/Fechado, tempo estimado e mensagem automática de confirmação agora disponíveis para todas as lojas (antes exclusivo da Lancheria da I9).',
  },
  {
    date: '10/04/2026',
    version: '1.25.1',
    type: 'fix',
    description: 'Persistência do estado de confirmação de pedidos no banco de dados — o botão "Confirmar" não reseta mais ao recarregar a página, evitando envio duplicado de mensagens WhatsApp.',
  },
  {
    date: '10/04/2026',
    version: '1.25.0',
    type: 'feature',
    description: 'Pedido Express (Lancheria da I9): novo fluxo de pedido em 5 etapas — telefone com busca automática de cliente, nome, seleção de produtos com adicionais, tipo de entrega (com endereço) e forma de pagamento. Envio automático da chave PIX via WhatsApp quando selecionado.',
  },
  {
    date: '10/04/2026',
    version: '1.24.0',
    type: 'feature',
    description: 'Fluxo Confirmar → Preparar: botão "Preparar" começa desabilitado até clicar em "Confirmar". Após confirmação, "Confirmar" fica cinza e "Preparar" fica ativo em vermelho.',
  },
  {
    date: '10/04/2026',
    version: '1.24.0',
    type: 'feature',
    description: 'Adicionais agrupados no pedido: itens extras agora aparecem separados por nome do grupo (ex: "Frutas: Manga, Abacaxi"), com preços individuais para itens pagos.',
  },
  {
    date: '10/04/2026',
    version: '1.24.0',
    type: 'improvement',
    description: 'Cards de pedido enriquecidos: exibição de método de pagamento (💳), modalidade (🛵 Entrega / 🤲 Retirada), troco (💵), e observações por item.',
  },
  {
    date: '10/04/2026',
    version: '1.23.0',
    type: 'improvement',
    description: 'Tooltips informativos em ações de produtos, categorias e grupos de opcionais para facilitar o uso do painel.',
  },
  {
    date: '09/04/2026',
    version: '1.22.0',
    type: 'feature',
    description: 'Badges de status no cardápio: exibição de "Aberto/Fechado" e tempo estimado de entrega no topo do cardápio público.',
  },
  {
    date: '09/04/2026',
    version: '1.22.0',
    type: 'feature',
    description: 'Data de nascimento obrigatória no checkout para todos os clientes, com máscara DD/MM/YYYY.',
  },
  {
    date: '09/04/2026',
    version: '1.22.0',
    type: 'improvement',
    description: 'Bordas dos campos de input do cardápio agora acompanham a cor primária da marca configurada.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'feature',
    description: 'Seção de destaques no cardápio: slideshow com produtos marcados como "Novidade", nome personalizável (Novidades, Destaques, Mais pedidos, Em alta) nas configurações.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'feature',
    description: 'Seletor de cor do botão do cardápio nas configurações de layout, aplicado em todo o fluxo de checkout.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'feature',
    description: 'CNPJ da empresa: novo campo nas configurações gerais.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'feature',
    description: 'Endereço estruturado da empresa: campos separados para Rua, Número, Bairro, Complemento e Ponto de Referência.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'feature',
    description: 'Flag "Novidade" nos produtos: toggle estrela para marcar itens que aparecem no slideshow de destaques.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'feature',
    description: 'Categorias animadas: opção de animação nos ícones/imagens das categorias no cardápio.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'improvement',
    description: 'Banner do estabelecimento com efeito Ken Burns (zoom suave) no cardápio V2.',
  },
  {
    date: '08/04/2026',
    version: '1.21.0',
    type: 'improvement',
    description: 'Templates do WhatsApp com formatação em negrito e espaçamento melhorado.',
  },
  {
    date: '06/04/2026',
    version: '1.20.0',
    type: 'feature',
    description: 'Troco para dinheiro: campo no checkout para informar valor do troco, exibido no pedido e na mensagem WhatsApp.',
  },
  {
    date: '04/04/2026',
    version: '1.19.0',
    type: 'feature',
    description: 'Toggles de entrega e retirada: lojista pode ativar/desativar cada modalidade nas configurações.',
  },
  {
    date: '31/03/2026',
    version: '1.18.1',
    type: 'fix',
    description: 'Correção de fuso horário: todos os horários agora exibidos no fuso de São Paulo (GMT-3).',
  },
  {
    date: '28/03/2026',
    version: '1.18.0',
    type: 'feature',
    description: 'Follow-up automático por WhatsApp: mensagem enviada 30 minutos após o pedido ser finalizado.',
  },
  {
    date: '28/03/2026',
    version: '1.18.0',
    type: 'feature',
    description: 'Mensagens do WhatsApp personalizáveis: templates editáveis para confirmação, preparo, pronto e finalizado.',
  },
  {
    date: '28/03/2026',
    version: '1.18.0',
    type: 'feature',
    description: 'Botão "Confirmar" no fluxo WhatsApp: envio de mensagem de confirmação ao aceitar pedido.',
  },
  {
    date: '28/03/2026',
    version: '1.17.0',
    type: 'feature',
    description: 'Chave PIX nos métodos de pagamento: exibida automaticamente no checkout quando o cliente seleciona PIX.',
  },
  {
    date: '28/03/2026',
    version: '1.17.0',
    type: 'feature',
    description: 'Flag "Item PDV": marcar produtos que aparecem apenas no ponto de venda, não no cardápio público.',
  },
  {
    date: '27/03/2026',
    version: '1.16.0',
    type: 'feature',
    description: 'Ordenação de produtos: definir ordem de exibição dos itens dentro de cada categoria.',
  },
  {
    date: '27/03/2026',
    version: '1.16.0',
    type: 'feature',
    description: 'Duplicação de grupos de adicionais: copia grupo completo incluindo itens e associações.',
  },
  {
    date: '27/03/2026',
    version: '1.16.0',
    type: 'feature',
    description: 'Edição individual de itens do grupo opcional: alterar nome, preço e status ativo de cada item.',
  },
  {
    date: '27/03/2026',
    version: '1.16.0',
    type: 'feature',
    description: 'Sobrescrita de mín/máx por produto: cada produto pode ter limites de seleção diferentes do grupo padrão.',
  },
  {
    date: '26/03/2026',
    version: '1.15.0',
    type: 'feature',
    description: 'Campo CPF no cadastro de clientes.',
  },
  {
    date: '26/03/2026',
    version: '1.15.0',
    type: 'improvement',
    description: 'Compressão automática de imagens: fotos de produtos são comprimidas antes do upload para economizar espaço.',
  },
  {
    date: '19/03/2026',
    version: '1.14.0',
    type: 'feature',
    description: 'Wizard lateral de adicionais: navegação entre grupos por rolagem horizontal passo a passo, configurável por empresa.',
  },
  {
    date: '18/03/2026',
    version: '1.13.0',
    type: 'feature',
    description: 'Diálogo "Adicionado ao Carrinho": confirmação visual ao adicionar produto com opção de continuar comprando ou ir ao carrinho.',
  },
  {
    date: '12/03/2026',
    version: '1.12.1',
    type: 'fix',
    description: 'Correção no layout do banner e sincronização de categorias com imagens.',
  },
  {
    date: '05/03/2026',
    version: '1.12.0',
    type: 'feature',
    description: 'Página de Categorias independente: gerenciamento com emoji, imagem e ordenação por categoria.',
  },
  {
    date: '05/03/2026',
    version: '1.12.0',
    type: 'feature',
    description: 'Layout visual (cards) para grupos de adicionais: exibição em grade de 3 colunas com imagens no cardápio.',
  },
  {
    date: '05/03/2026',
    version: '1.12.0',
    type: 'improvement',
    description: 'Adicionais exibidos no carrinho do cardápio com miniaturas e preços individuais.',
  },
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
    description: 'WhatsApp: cooldown de 24h para respostas automáticas — mesmo número não recebe saudação duplicada.',
  },
  {
    date: '27/02/2026',
    version: '1.10.1',
    type: 'feature',
    description: 'Notificação de sugestões implementadas: ao abrir o sistema, lojistas são notificados com um modal sobre suas sugestões concluídas.',
  },
  {
    date: '24/02/2026',
    version: '1.10.0',
    type: 'feature',
    description: 'Grupos de Adicionais: cadastro de opcionais com mínimo/máximo de seleção, vinculáveis a categorias ou produtos específicos, com importação por IA.',
  },
  {
    date: '23/02/2026',
    version: '1.9.1',
    type: 'feature',
    description: 'Geração de Documentos: card no PDV com opções "Somente Venda" e "Venda com NFC-e".',
  },
  {
    date: '23/02/2026',
    version: '1.9.1',
    type: 'feature',
    description: 'Emissão posterior de NFC-e: vendas sem nota fiscal podem ter a NFC-e gerada pelo menu de vendas do caixa.',
  },
  {
    date: '23/02/2026',
    version: '1.9.1',
    type: 'improvement',
    description: 'Monitor NFC-e: botão de reprocessar disponível para notas pendentes, rejeitadas e com erro.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'feature',
    description: 'Sistema de Sugestões: lojistas podem enviar ideias e acompanhar o status com previsão de entrega.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'feature',
    description: 'Importação de Cardápio por IA: envie uma foto ou PDF e o sistema extrai produtos, preços e categorias automaticamente.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'improvement',
    description: 'PDV aguarda retorno da SEFAZ antes de oferecer impressão da NFC-e.',
  },
  {
    date: '23/02/2026',
    version: '1.9.0',
    type: 'feature',
    description: 'Impressão automática no PDV: toggles para imprimir comprovante de venda e DANFE automaticamente.',
  },
  {
    date: '19/02/2026',
    version: '1.8.1',
    type: 'improvement',
    description: 'Impressão automática (script Python) com layout HTML idêntico à impressão manual, carregando tamanho da bobina configurado.',
  },
  {
    date: '18/02/2026',
    version: '1.8.0',
    type: 'fix',
    description: 'Correção completa do fluxo de emissão NFC-e: checkbox "Emitir NFC-e", vinculação sale_id e melhoria no feedback de erros.',
  },
  {
    date: '17/02/2026',
    version: '1.7.1',
    type: 'improvement',
    description: 'Ao enviar pedido pelo WhatsApp, cliente recebe toast de confirmação e retorna ao cardápio automaticamente.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'feature',
    description: 'Filtro por intervalo de datas nos pedidos e dashboard, com faturamento baseado em pedidos finalizados.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'fix',
    description: 'Cards de estatísticas atualizam em tempo real conforme pedidos avançam de etapa.',
  },
  {
    date: '17/02/2026',
    version: '1.7.0',
    type: 'feature',
    description: 'Tempo estimado de preparo configurável, enviado automaticamente ao aceitar pedido.',
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
    description: 'Relatórios consideram pedidos finalizados além das vendas do PDV.',
  },
  {
    date: '17/02/2026',
    version: '1.6.1',
    type: 'fix',
    description: 'Corrigido flickering ao navegar entre menus.',
  },
  {
    date: '17/02/2026',
    version: '1.6.0',
    type: 'fix',
    description: 'Isolamento de dados por empresa: pedidos, caixas, vendas e relatórios filtrados por company_id.',
  },
  {
    date: '17/02/2026',
    version: '1.6.0',
    type: 'feature',
    description: 'Códigos de pedidos alfanuméricos aleatórios (ex: A123B4).',
  },
  {
    date: '17/02/2026',
    version: '1.6.0',
    type: 'feature',
    description: 'Seleção de tamanho da bobina (58mm ou 80mm) nas configurações.',
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