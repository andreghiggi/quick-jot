/**
 * Versão atual do Comanda Tech.
 * Incremente a cada release e adicione entrada em RELEASES (mais recente no topo).
 *
 * SemVer:
 *  - MAJOR: mudanças grandes / quebras
 *  - MINOR: nova feature
 *  - PATCH: correção de bug
 */
export const VERSION = "1.5.2";
export const RELEASE_DATE = "2026-06-02"; // YYYY-MM-DD (America/Sao_Paulo)
export const CODENAME = "Correção de cobrança fracionada";

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  codename?: string;
  changes: string[];
}

export const RELEASES: Release[] = [
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