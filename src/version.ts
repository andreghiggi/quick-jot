/**
 * Versão atual do Comanda Tech.
 * Incremente a cada release e adicione entrada em RELEASES (mais recente no topo).
 *
 * SemVer:
 *  - MAJOR: mudanças grandes / quebras
 *  - MINOR: nova feature
 *  - PATCH: correção de bug
 */
export const VERSION = "1.10.0-beta";
export const RELEASE_DATE = "2026-06-03"; // YYYY-MM-DD (America/Sao_Paulo)
export const CODENAME = "Controle de Estoque (mercado) — beta";

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  codename?: string;
  changes: string[];
}

export const RELEASES: Release[] = [
  {
    version: "1.10.0-beta",
    date: "2026-06-03",
    codename: "Controle de Estoque (mercado) — beta",
    changes: [
      "Fase 3 do módulo Mercado: produtos agora podem ter controle de estoque individual. Em Produtos, ao editar um item, aparece a seção 'Controle de estoque' (apenas para lojas com módulo Mercado ativo) com saldo atual e estoque mínimo.",
      "Baixa automática no Frente de Caixa: cada venda dispara automaticamente o débito do estoque dos produtos com 'Controle de estoque' ativado, registrando o movimento no histórico. Produtos sem rastreio continuam vendendo normalmente, sem qualquer mudança de comportamento.",
      "Nova tela 'Estoque' (rota /estoque) no menu Catálogo, visível só com módulo Mercado: lista todos os produtos rastreados com saldo atual, alerta de mínimo (vermelho = zerado, amarelo = abaixo do mínimo, verde = OK), filtros por categoria/busca e exportação CSV.",
      "Ações por produto: Entrada manual (nota fiscal de fornecedor), Saída manual (perda/quebra), Ajuste de inventário (define um saldo novo direto) e Histórico completo de movimentos com data, tipo, quantidade, saldo resultante e observação.",
      "Nova tabela 'stock_movements' grava todo o histórico (vendas, entradas, saídas, ajustes). Função SQL 'apply_stock_movement' faz a baixa atomicamente — se o produto não tem rastreio ativo, é no-op silencioso.",
      "Não regressivo: lojas sem módulo Mercado não veem nada novo. Pedido Express, PDV V2, TEF v1.0/v1.1/v1.2-beta, Multi-Pagamento, NFC-e e impressão NÃO foram tocados. A baixa só ocorre via Frente de Caixa nesta fase — Pedido Express ainda não dá baixa (será fase seguinte se validado em piloto).",
    ],
  },
  {
    version: "1.9.0-beta",
    date: "2026-06-03",
    codename: "Frente de Caixa (mercado) — beta",
    changes: [
      "Nova tela 'Frente de Caixa' (rota /frente-caixa) disponível apenas para lojas com o módulo 'Mercado' ativo — pensada para mini mercados e lojas de conveniência que vendem produtos com código de barras.",
      "Operação 100% por leitor: input sempre focado, bipe → produto entra na lista, Enter adiciona, F2 finaliza, F4 remove o último item, Esc cancela a venda.",
      "Busca aceita GTIN exato, SKU exato ou nome parcial. Atalho '3*7891234567890' adiciona 3 unidades de uma vez. Feedback sonoro curto para sucesso/erro.",
      "Finalização reusa o diálogo de pagamento do PDV V2 (canal PDV) e registra a venda no caixa atual via fluxo já existente — nenhum dado novo no banco.",
      "TEF integrado ainda NÃO disponível na Frente de Caixa nesta versão beta; ao escolher uma forma TEF, o sistema avisa para usar o PDV V2. NFC-e/impressão automática virão na próxima iteração.",
      "Item 'Frente de Caixa' aparece no menu lateral apenas quando o módulo 'Mercado' está ativo. PDV V2, Pedido Express, Cobrança, TEF v1.0/v1.1/v1.2-beta e Multi-Pagamento NÃO foram alterados.",
      "Rollout isolado: módulo 'Mercado' continua desligado por padrão — ativar manualmente em Admin → Módulos da empresa apenas em lojas-piloto de mercado.",
    ],
  },
  {
    version: "1.8.5",
    date: "2026-06-02",
    codename: "Formas Entrega/Retirada para todas as lojas",
    changes: [
      "Divisão de formas de pagamento por modalidade (Entrega/Retirada) liberada para TODAS as lojas — antes era exclusivo da Lancheria I9 e Bon Appetit.",
      "Em Configurações → Formas de Pagamento, nas abas Cardápio Online e Pedido Express, agora aparecem os toggles 'Mostrar para Entrega' e 'Mostrar para Retirada' em cada forma.",
      "Cardápio Online e Pedido Express passam a filtrar automaticamente as formas conforme a modalidade escolhida pelo cliente. PDV (caixa) continua sem essa divisão.",
      "Padrão preservado: lojas existentes já tinham 'show_for_delivery' e 'show_for_pickup' = true por default, portanto nada some sem ação manual.",
      "Nenhum fluxo de TEF, NFC-e, Multi-Pagamento, impressão ou PDV V2 foi alterado.",
    ],
  },
  {
    version: "1.8.4-beta",
    date: "2026-06-02",
    codename: "Layout V3 densidade Agilize (beta)",
    changes: [
      "Layout V3 reaproximado da foto de referência: hierarquia única no PED #xxx (13pt bold) — nome da loja e demais textos em 8.5pt uniforme.",
      "Removida faixa de modalidade em texto invertido; agora usa 3 linhas literais de '#' espelhando o cupom Agilize.",
      "Densidade aumentada: line-height 0.95, padding 1mm, zero linhas em branco entre seções, cabeçalho da tabela cola direto nos itens.",
      "Quebra de página suprimida (page-break-inside: avoid) — recibo sai em fluxo contínuo numa única folha térmica.",
      "V1 e V2 permanecem 100% intactos. Mudança isolada ao V3 da Lancheria I9.",
    ],
  },
  {
    version: "1.8.3-beta",
    date: "2026-06-02",
    codename: "Layout V3 grade 48 cols (beta)",
    changes: [
      "Layout V3 do recibo agora usa grade FIXA de 48 colunas monoespaçadas (padrão ESC/POS Epson TM-T20/TM-T88 @ 80mm), fonte Courier New 9pt, line-height 1.0.",
      "Estrutura espelhada da foto de referência: PED #xxx centralizado, faixa de modalidade em texto invertido, tabela 'REF| DESCRICAO ... VALOR', itens com nome + preço unitário, complementos numerados '[N] item' indentados em 3 colunas e linha de subtotal 'Q X R$ X,XX = R$ X,XX' alinhada à direita.",
      "Totais com pipe a 17 colunas ('TOTAL ITENS | ... R$ X,XX'), TOTAL GERAL em negrito, metadados (COD/Criado em/Impresso em) no mesmo padrão pipe.",
      "Largura fixa 80mm, altura automática, sem centralização excessiva — apenas nome da loja, PED e modalidade são centralizados.",
      "Layouts V1 e V2 permanecem 100% intactos. Rollout V3 continua isolado por loja (atualmente só Lancheria da I9).",
    ],
  },
  {
    version: "1.8.2-beta",
    date: "2026-06-02",
    codename: "Layout V3 ESC/POS Epson (beta)",
    changes: [
      "Layout V3 do recibo (PDV V2 / Pedido Express / Cardápio Online) reescrito como template ESC/POS Epson TM-T20/TM-T88 — fonte Courier New única, line-height 1.0, ~40% menos espaçamento entre itens e alinhamento por colunas fixas (42 cols @ 80mm, 32 cols @ 58mm).",
      "Coluna VALOR sempre alinhada à direita em todas as linhas (descrição, totais e meta) usando padding por caractere.",
      "Faixa de modalidade (BALCAO/ENTREGA/RETIRADA) agora sai em texto invertido (fundo preto / texto branco), equivalente ao reverse video ESC/POS (GS B 1), substituindo os '#####' do V3 anterior.",
      "Separadores em ASCII ('-' repetido na largura total) no lugar de <hr> dashed.",
      "Layouts V1 e V2 permanecem 100% intactos. Rollout V3 continua isolado por loja (atualmente só Lancheria da I9).",
      "Nenhum fluxo de TEF (v1.0/v1.1/v1.2-beta), NFC-e, Multi-Pagamento, PDV V2 ou auto_printer.py foi alterado — mudança 100% no HTML gerado no lado web.",
    ],
  },
  {
    version: "1.8.1-beta",
    date: "2026-06-02",
    codename: "Layout V3 fiel ao Agilize (beta)",
    changes: [
      "Layout V3 de impressão reescrito do zero para replicar fielmente o recibo térmico Agilize: cabeçalho da loja (nome, endereço, CNPJ), PED #xxx centralizado, bloco cliente com Fones/endereço/Bairro/Ponto de referência, faixa de modalidade (TELE ENTREGA/MOTOBOY, RETIRADA NO LOCAL, BALCÃO, MESA) em ASCII, tabela REF|DESCRICAO|VALOR com adicionais numerados entre colchetes, TOTAL ITENS + FRETE + TOTAL GERAL separados, bloco de PAGAMENTO/TROCO, COD/Criado em/Impresso em, faixa PREVISTO e rodapé com URL do app.",
      "Fonte alterada para Lucida Console/Consolas com tamanhos compactos (8-11pt), eliminando os títulos gigantes do V3 anterior.",
      "Reescrita aplicada tanto no auto_printer.py (cardápio online / WhatsApp) quanto em pdvV2Print.ts (PDV V2 / Pedido Express) — versões visualmente idênticas.",
      "Layouts V1 e V2 permanecem 100% intactos. Nenhuma loja sem 'Layout V3' selecionado teve qualquer alteração.",
      "Nenhum fluxo de TEF (v1.0/v1.1/v1.2-beta), NFC-e, Multi-Pagamento ou banco de dados foi alterado.",
    ],
  },
  {
    version: "1.8.0-beta",
    date: "2026-06-02",
    codename: "Layout de impressão V3 (beta)",
    changes: [
      "Novo Layout V3 de impressão (beta) disponível em Configurações → Impressão → Layout de Impressão (visível apenas para Admin Master). Pode ser selecionado por loja sem afetar as demais.",
      "Comanda de produção V3: cabeçalho 'PEDIDO' gigante, separadores em ASCII, faixa de tipo do pedido (ENTREGA/RETIRADA/MESA/BALCÃO) em destaque, bloco 'Pronto até' com moldura e adicionais empilhados em caixa alta.",
      "Recibo V3 no auto_printer.py: layout denso inspirado no recibo V3 do PDV V2, com PED #, totais destacados e badge de Entrega/Retirada. Reimpressão a partir do Painel mantém o mesmo visual.",
      "Layouts V1 e V2 permanecem 100% intactos — nenhuma loja que não selecionar V3 manualmente terá qualquer alteração visual.",
      "Nenhum fluxo de TEF, NFC-e, PDV V2, Multi-Pagamento ou banco de dados foi alterado.",
    ],
  },
  {
    version: "1.7.1-beta",
    date: "2026-06-02",
    codename: "Taxas Cidade/Interior opcionais",
    changes: [
      "Configurações → Entrega: cada taxa (Cidade e Interior) agora tem um interruptor próprio. Lojas que não atendem interior podem desativar essa região e o campo de valor fica bloqueado.",
      "Cardápio Online e Pedido Express: regiões desativadas somem do checkout. Quando só uma região está ativa, o cliente vê apenas 'Entrega' (sem precisar escolher entre Cidade/Interior).",
      "Padrão preservado: lojas existentes continuam com as duas regiões ativas — nenhuma mudança visível até desligar manualmente.",
      "Nenhum fluxo de TEF, NFC-e, impressão, PDV V2 ou Multi-Pagamento foi alterado.",
    ],
  },
  {
    version: "1.7.0-beta",
    date: "2026-06-02",
    codename: "Múltiplos endereços por cliente",
    changes: [
      "Cardápio Online: clientes recorrentes agora podem manter mais de um endereço cadastrado. Ao digitar o telefone, aparece o seletor 'Endereços salvos' com botões 'Novo' (para cadastrar outro) e 'Gerenciar' (para escolher um padrão ou excluir).",
      "Comportamento atual preservado: o primeiro endereço continua sendo preenchido automaticamente como antes; quem só tem um endereço não vê nenhuma mudança no fluxo.",
      "Backfill automático: todos os endereços já cadastrados foram migrados para a nova base de múltiplos endereços, marcados como padrão.",
      "Nenhum fluxo de pedido, cobrança, NFC-e, impressão ou PDV foi alterado.",
    ],
  },
  {
    version: "1.6.2-beta",
    date: "2026-06-02",
    codename: "Filtros avançados em Pedidos",
    changes: [
      "Aba Pedidos: novos filtros por Forma de Entrega (Entrega/Retirada), Origem (Cardápio Online, Balcão/Express, Mesa, Mesa via QR) e Forma de Pagamento (lista dinâmica, incluindo 'Múltiplas formas' e 'Sem pagamento').",
      "Totalizadores reativos abaixo dos filtros: número de pedidos, faturamento, ticket médio e cancelados — recalculam conforme os filtros aplicados.",
      "Filtros são puramente de visualização: nenhum fluxo de cobrança, TEF, NFC-e, impressão ou banco de dados foi alterado.",
    ],
  },
  {
    version: "1.6.1-beta",
    date: "2026-06-02",
    codename: "Dividir formas em todos os checkouts (beta)",
    changes: [
      "Botão 'Dividir formas' movido para DENTRO do checkout de pagamento — agora aparece como um link discreto logo abaixo da seleção da forma de pagamento, em vez de ficar solto ao lado de 'Enviar para Cozinha'.",
      "Disponível em todos os checkouts: Pedido Express (Finalizar Pedido), Cobrar Pedido do Cardápio e Importar/Cobrar Comanda/Mesa no PDV V2.",
      "O link só aparece quando faz sentido: não é exibido quando a comanda está em divisão por pessoas ou por itens (TEF v1.1 congelado).",
      "Mesma lógica tudo-ou-nada: TEF recusado → estorno automático de todas as cobranças já aprovadas.",
      "Fluxos congelados (TEF v1.0/v1.1/v1.2-beta, pagamento simples, divisão por pessoas/itens) não foram alterados.",
    ],
  },
  {
    version: "1.6.0-beta",
    date: "2026-06-02",
    codename: "Dividir formas de pagamento (beta)",
    changes: [
      "Novo botão 'Dividir formas' no Pedido Express (etapa 5): permite cobrar a venda em várias formas de pagamento ao mesmo tempo (ex.: parte no TEF/cartão, parte em dinheiro, ou em vários cartões).",
      "Cobranças TEF são executadas em sequência no PinPad. Se qualquer uma for recusada, todas as já aprovadas são estornadas automaticamente e a venda não é registrada (modo tudo-ou-nada).",
      "Quando o módulo Fiscal está ativo, a NFC-e sai com várias formas de pagamento (detPag) em uma única nota.",
      "Rollout piloto: apenas Pedido Express. PDV V2, Cobrança de Pedido e Finalizar Venda virão em uma próxima atualização após validação.",
      "Fluxos congelados (TEF v1.0/v1.1/v1.2-beta, pagamento simples, comandas, mesas) não foram alterados.",
    ],
  },
  {
    version: "1.5.4",
    date: "2026-06-02",
    codename: "Desconto restaurado na cobrança",
    changes: [
      "Campo 'Desconto (R$)' restaurado no diálogo de pagamento — aparece novamente em Cobrar Pedido do Cardápio, Importar e Cobrar Mesa, Pedido Express e Finalizar Venda do PDV V2.",
    ],
  },
  {
    version: "1.5.3",
    date: "2026-06-02",
    codename: "Cobrança rachada por pessoas",
    changes: [
      "Cobrar pedido do cardápio (Lancheria I9) - divisão por pessoas: a parcela cobrada (ex.: R$ 7 de R$ 30) entra no caixa com o valor real e o pedido fica como 'parcial', mantendo o botão Cobrar disponível para o saldo restante até a quitação total.",
    ],
  },
  {
    version: "1.5.2",
    date: "2026-06-02",
    codename: "Correção de cobrança fracionada",
    changes: [
      "Cobrar pedido do cardápio (Lancheria I9): ao dividir um item e cobrar apenas uma fração na primeira cobrança, o sistema agora respeita o valor selecionado em vez de marcar o item inteiro como pago. O botão Cobrar continua disponível para o saldo restante.",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-06-02",
    codename: "Quebra de texto no modal de cobrança",
    changes: [
      "Modal 'Cobrar pedido' (PDV V2): nomes longos de itens com muitos adicionais agora quebram em várias linhas em vez de truncar, evitando o corte visual do modal.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-06-01",
    codename: "TEF v1.1 + Pedido Express + Mesa QR",
    changes: [
      "Sistema de versionamento com badge discreto no canto inferior direito",
      "TEF v1.1 consolidado (Lancheria I9)",
      "Pedido Express com todas as formas de pagamento",
      "Cardápio Mesa QR (rota /mesa/:slug)",
      "Campanhas de vendas via WhatsApp",
    ],
  },
];

/** Formata data YYYY-MM-DD para DD/MM/YYYY (pt-BR). */
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}