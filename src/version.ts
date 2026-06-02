/**
 * Versão atual do Comanda Tech.
 * Incremente a cada release e adicione entrada em RELEASES (mais recente no topo).
 *
 * SemVer:
 *  - MAJOR: mudanças grandes / quebras
 *  - MINOR: nova feature
 *  - PATCH: correção de bug
 */
export const VERSION = "1.6.1-beta";
export const RELEASE_DATE = "2026-06-02"; // YYYY-MM-DD (America/Sao_Paulo)
export const CODENAME = "Dividir formas em todos os checkouts (beta)";

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  codename?: string;
  changes: string[];
}

export const RELEASES: Release[] = [
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