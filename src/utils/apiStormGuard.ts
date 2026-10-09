/**
 * Disjuntor contra "tempestade de requisições" à nossa própria API.
 *
 * Contexto: em mais de uma loja (confirmado na Bon Appetit em
 * 03-04/10 e 07-08/10/2026), o terminal do PDV entrou em rajadas de
 * 100+ requisições/segundo contra api.comandatech.com.br, repetindo os
 * mesmos dados básicos (configurações, formas de pagamento, produtos...)
 * sem parar por ~15s de cada vez, deixando a tela travada. A causa exata
 * no código que dispara isso ainda não foi encontrada — isto aqui é uma
 * proteção, não a correção da causa raiz: detecta o padrão e PAUSA as
 * chamadas por alguns segundos antes que vire um problema pro servidor
 * (e pro resto das lojas), em vez de deixar martelar sem limite.
 *
 * Instalado o mais cedo possível (antes do React montar), interceptando
 * `window.fetch` só para requisições à nossa própria API — não afeta
 * imagens, fontes ou qualquer outro domínio.
 */

const API_HOST = "api.comandatech.com.br";
const WINDOW_MS = 5_000;
const THRESHOLD = 100; // acima disso em 5s é claramente anormal (uso normal fica bem abaixo)
const COOLDOWN_MS = 8_000;

let timestamps: number[] = [];
let cooldownUntil = 0;
let warned = false;

function isApiUrl(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.includes(API_HOST);
  } catch {
    return false;
  }
}

function notifyOnce(message: string) {
  if (warned) return;
  warned = true;
  try {
    // Import dinâmico pra não acoplar este módulo (carregado bem cedo) à
    // árvore de toasts/UI — só tenta mostrar se já existir no app.
    import("sonner")
      .then(({ toast }) => toast.error(message))
      .catch(() => {
        console.error("[api-storm-guard]", message);
      });
  } catch {
    console.error("[api-storm-guard]", message);
  }
  setTimeout(() => {
    warned = false;
  }, COOLDOWN_MS);
}

export function installApiStormGuard(): void {
  if (typeof window === "undefined" || !window.fetch) return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiUrl(input)) return originalFetch(input, init);

    const now = Date.now();

    if (now < cooldownUntil) {
      return Promise.reject(
        new Error("Muitas requisições em sequência — pausado por alguns segundos para evitar sobrecarga."),
      );
    }

    timestamps.push(now);
    // mantém só os timestamps dentro da janela
    const cutoff = now - WINDOW_MS;
    while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();

    if (timestamps.length > THRESHOLD) {
      cooldownUntil = now + COOLDOWN_MS;
      timestamps = [];
      notifyOnce(
        "Detectamos muitas requisições repetidas e pausamos por alguns segundos. Se a tela não voltar ao normal, recarregue a página.",
      );
      return Promise.reject(new Error("Pausa automática: tempestade de requisições detectada."));
    }

    return originalFetch(input, init);
  };
}
