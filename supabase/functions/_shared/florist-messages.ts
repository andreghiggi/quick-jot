import { buildFloralStages, type FloralOrder, type FloralStage } from './florist-fulfillment.ts';
export interface FloralHours { day_of_week: number; is_open: boolean; always_open?: boolean; open_time: string | null; close_time: string | null; period_number?: number }
const DAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function floralBusinessState(hours: FloralHours[], now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  const current = Number(get('hour')) * 60 + Number(get('minute'));
  const periods = (day: number) => hours.filter(h => h.day_of_week === day && h.is_open && h.open_time && h.close_time)
    .sort((a,b) => (a.open_time || '').localeCompare(b.open_time || ''));
  const today = periods(dow);
  const always = hours.length === 0 || hours.some(h => h.always_open);
  const isOpen = always || today.some(h => h.open_time && h.close_time && current >= minute(h.open_time) && current <= minute(h.close_time));
  const formattedHours = always ? 'aberto 24 horas' : today.length ? today.map(h => `${h.open_time?.slice(0,5)} às ${h.close_time?.slice(0,5)}`).join(' e ') : 'fechado hoje';
  let returnTime = '';
  for (let offset = 0; offset <= 7; offset++) {
    const next = periods((dow + offset) % 7).find(h => h.open_time && (offset > 0 || minute(h.open_time) > current));
    if (next?.open_time) { returnTime = `${offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : DAYS[(dow+offset)%7]} às ${next.open_time.slice(0,5)}`; break; }
  }
  return { isOpen, formattedHours, returnTime, canScheduleToday: today.some(h => h.open_time && minute(h.open_time) > current) };
}

export const FLORAL_TEMPLATES = [
  { status: 'Saudação', settingKey: 'whatsapp_florist_greeting', defaultMsg: '🌸 Olá! Bem-vindo(a) à {{loja}}! Que alegria ter você por aqui! 😊\n\nPara ver os produtos, preços e fazer seu pedido completo, é só clicar no link abaixo:\n👉 {{link_cardapio}}\n\nLá você escolhe tudo do seu jeito, sem espera: entrega ou retirada, data, horário e cartão com mensagem. 💐\n\nSe surgir alguma dúvida, estamos por aqui! 😊' },
  { status: 'Fora do horário · com agendamento', settingKey: 'whatsapp_florist_closed_scheduling', defaultMsg: '🌸 Olá! Bem-vindo(a) à {{loja}}!\n\nNo momento estamos fora do nosso horário de atendimento, mas você pode agendar seu pedido normalmente pelo nosso catálogo para a data que desejar:\n👉 {{link_cardapio}}\n\n⏰ Nosso horário de atendimento hoje é: {{horario}}\n\nAssim que nossa equipe iniciar o expediente, responderemos sua mensagem aqui com todo o carinho! 💐✨' },
  { status: 'Fora do horário · sem agendamento', settingKey: 'whatsapp_florist_closed', defaultMsg: '🌸 Olá! Bem-vindo(a) à {{loja}}! 😊\n\nNo momento estamos fora do horário de atendimento. Voltamos {{horario_retorno}}.\n\nEnquanto isso, você já pode conhecer nosso catálogo, ver preços e escolher seus favoritos:\n👉 {{link_cardapio}}\n\nAté breve! 💐' },
  { status: 'Confirmado', settingKey: 'whatsapp_florist_confirmed', defaultMsg: '🌸 Olá, *{{nome}}*! Seu pedido *{{num}}* foi confirmado com sucesso na *{{loja}}*! 💐\n\n{{resumo_remessas}}\n\n💳 *Total:* {{total}}' },
  { status: 'Retirada pronta', settingKey: 'whatsapp_florist_ready_for_pickup', defaultMsg: '🌸 {{nome}}, os itens para RETIRADA do seu pedido {{num}} já estão prontos e disponíveis para retirada na loja!\n\n📦 Itens:\n{{itens}}\n\n📍 Endereço: {{endereco}}\n\nNosso horário de atendimento hoje é: {{horario}}' },
  { status: 'Saiu para entrega', settingKey: 'whatsapp_florist_out_for_delivery', defaultMsg: '🛵 *{{nome}}*, novidade sobre o pedido *{{num}}*!\n\nO presente para *{{destinatario}}* acabou de sair para entrega com nosso entregador! 💐\n\n📦 *Itens a caminho:*\n{{itens}}\n\n📍 *Destino:* {{endereco_entrega}}\nAvisaremos assim que for entregue! ✨' },
  { status: 'Entregue', settingKey: 'whatsapp_florist_delivered', defaultMsg: '🎉 *{{nome}}*, missão cumprida!\n\nO presente do seu pedido *{{num}}* foi *entregue com sucesso* para *{{destinatario}}*! 💐✨\n\nEsperamos que tenha trazido muitos sorrisos! Muito obrigado pelo carinho e confiança.' },
  { status: 'Concluído', settingKey: 'whatsapp_florist_completed', defaultMsg: '🌸 *{{nome}}*, todas as entregas e retiradas do seu pedido *{{num}}* foram concluídas!\n\nFoi um prazer enorme fazer parte desse momento especial com você. 🥰\n\n⭐ *Sua opinião é muito importante para nós!*\nSe puder deixar uma avaliação rápida no nosso Google, nos ajuda imensamente:\n👉 {{google_review}}\n\nPara novos presentes ou flores para alegrar o dia:\n👉 {{link_cardapio}}\n\nAté a próxima! 💐✨' },
];
export const FLORAL_VARIABLES = ['{{nome}}','{{num}}','{{loja}}','{{link_cardapio}}','{{horario}}','{{horario_retorno}}','{{resumo_remessas}}','{{itens}}','{{total}}','{{destinatario}}','{{endereco}}','{{endereco_entrega}}','{{google_review}}'];
export function floralTemplate(key: string, vars: Record<string,string>, custom: Record<string,string> = {}) {
  let text = custom[key] || FLORAL_TEMPLATES.find(t => t.settingKey === key)?.defaultMsg || '';
  text = text.replace(/\\n/g, '\n');
  if (!vars.horario_retorno) text = text.replace(/\s*Voltamos {{horario_retorno}}\./g, '');
  if (!vars.google_review) text = text.replace(/⭐ \*Sua opinião[\s\S]*?👉 {{google_review}}\n*/g, '');
  for (const [key,value] of Object.entries(vars)) text = text.split(`{{${key}}}`).join(value);
  return text.trim();
}
export function floralGreetingVariant(state: ReturnType<typeof floralBusinessState>, acceptsScheduling: boolean) {
  return state.isOpen ? 'whatsapp_florist_greeting' : acceptsScheduling && state.canScheduleToday ? 'whatsapp_florist_closed_scheduling' : 'whatsapp_florist_closed';
}
const safe = (s: string) => s.replace(/[\r\n*]/g, ' ').trim();
const itemText = (s: FloralStage) => s.items.map(i => `• *${i.quantity}x ${safe(i.name)}*`).join('\n');
export function floralStageAddress(s: FloralStage, fallback = '') {
  const d = s.destination;
  return d?.street ? [d.street, d.number].filter(Boolean).join(', ') + [d.complement,d.neighborhood].filter(Boolean).map(x => ` - ${x}`).join('') : fallback;
}
export function floralSummary(stages: FloralStage[]) {
  const count = stages.filter(s => s.mode === 'delivery').length;
  let n = 0;
  return stages.map(s => s.mode === 'delivery'
    ? `🛵 *Entrega${count > 1 ? ` ${++n}` : ''}* — avisaremos assim que sair para entrega.\n${s.date.split('-').slice(1).reverse().join('/')} (${s.slot || 'horário a combinar'})\n\n${itemText(s)}\n\n*Para:* ${safe(s.recipientName)}`
    : `🏪 *Retirada na loja* — avisaremos assim que estiver pronto para você buscar!\n\n${itemText(s)}`).join('\n\n');
}
export function formatFloralNotice(event: string, order: FloralOrder & { shortCode?: string | null; total: number }, context: { storeName: string; storeAddress: string; menuUrl: string; reviewUrl?: string; hours: FloralHours[]; custom?: Record<string,string> }, stageId = '') {
  if (!order.shortCode) throw new Error('Pedido sem o código exibido no painel; confira o cadastro antes de notificar');
  const stages = buildFloralStages(order);
  const stage = stages.find(s => s.id === stageId);
  if (['ready_for_pickup','out_for_delivery','delivered'].includes(event) && !stage) throw new Error('Remessa não encontrada');
  if (event === 'received') return `${safe((order.customerName || '').split(' ')[0])}, seu pedido #${order.shortCode} foi enviado e está aguardando confirmação da ${safe(context.storeName)}.\n\nAssim que seu pedido for confirmado, você será notificado por aqui. 😊`;
  const vars = { nome: safe((order.customerName || '').split(' ')[0]), num: `#${order.shortCode}`, loja: safe(context.storeName),
    link_cardapio: context.menuUrl, google_review: context.reviewUrl || '', horario: floralBusinessState(context.hours).formattedHours,
    resumo_remessas: floralSummary(stages), itens: stage ? itemText(stage) : '', destinatario: safe(stage?.recipientName || ''),
    endereco: context.storeAddress, endereco_entrega: stage ? floralStageAddress(stage,order.deliveryAddress || '') : '',
    total: order.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) };
  let message = floralTemplate(`whatsapp_florist_${event}`, vars, context.custom);
  if (stage?.destination?.forWhom === 'self') message = message.replace('O presente para', 'Os itens para').replace('O presente do seu pedido', 'Os itens do seu pedido').replace('foi *entregue com sucesso*', 'foram *entregues com sucesso*');
  return message;
}