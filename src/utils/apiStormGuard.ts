/**
 * "Disjuntor" contra tempestade de requisições à nossa própria API.
 *
 * Contexto: confirmado em 9 dias de log (01-09/10/2026) que pelo menos 9
 * lojas diferentes (Bon Appetit, Rei do Açaí, Império do Açaí, Lancheria i9,
 * Espaço Lanches, Cozinha da Ruiva, Amore Mio, Margen Pizzaria, Scubidão
 * Lanches) sofrem rajadas de até 100+ requisições/segundo contra
 * api.comandatech.com.br, repetindo os mesmos dados básicos (configurações,
 * formas de pagamento, produtos...) sem parar — às vezes por só 1-2s, às
 * vezes por 15s+. A causa raiz no código ainda NÃO foi encontrada (não é
 * nenhuma das 5 assinaturas de tempo real existentes, nem o tratamento de
 * renovação de token, nem o error boundary — todos já revisados e
 * descartados). Isto aqui é contenção + diagnóstico, não a correção da
 * causa raiz.
 *
 * O disjuntor faz duas coisas, instalado o mais cedo possível (antes do
 * React montar), interceptando `window.fetch` só para requisições à nossa
 * própria API — não afeta imagens, fontes ou qualquer outro domínio:
 *
 *  1. CONTENÇÃO: mais de `THRESHOLD` requisições em `WINDOW_MS` = pausa
 *     automática de `COOLDOWN_MS`, rejeitando novas chamadas nesse intervalo
 *     (evita martelar o servidor e afetar as outras lojas).
 *  2. DIAGNÓSTICO: ao disparar, registra uma amostra das URLs que estavam
 *     repetindo na tabela `disjuntor_eventos` (RLS: cada loja só vê os
 *     próprios eventos; super_admin vê todos) — usa o `fetch` ORIGINAL
 *     (não interceptado) pra esse POST, senão o próprio disjuntor bloquearia
 *     seu próprio diagnóstico.
 */

const API_HOST = "api.comandatech.com.br";
const WINDOW_MS = 5_000;
const THRESHOLD = 100; // acima disso em 5s é claramente anormal (uso normal fica bem abaixo)
const COOLDOWN_MS = 8_000;
const SAMPLE_SIZE = 20;

let timestamps: number[] = [];
let recentUrls: string[] = [];
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

function urlOf(input: RequestInfo | URL): string {
  try {
    return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  } catch {
    return "";
  }
}

/** Extrai company_id de alguma das URLs amostradas (ex.: "...?company_id=eq.<uuid>..."). */
function extractCompanyId(urls: string[]): string | null {
  for (const u of urls) {
    const m = u.match(/company_id=eq\.([0-9a-f-]{36})/i);
    if (m) return m[1];
  }
  return null;
}

async function logDisjuntorEvento(
  originalFetch: typeof fetch,
  count: number,
  urls: string[],
): Promise<void> {
  try {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
    const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
    if (!supabaseUrl || !anonKey) return;

    const payload = {
      company_id: extractCompanyId(urls),
      requests_in_window: count,
      window_ms: WINDOW_MS,
      sample_urls: urls.slice(0, SAMPLE_SIZE),
      page_url: window.location.href,
      visibility_state: document.visibilityState,
      online: navigator.onLine,
      user_agent: navigator.userAgent,
    };

    await originalFetch(`${supabaseUrl}/rest/v1/disjuntor_eventos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[disjuntor] falha ao registrar diagnóstico", e);
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
        console.error("[disjuntor]", message);
      });
  } catch {
    console.error("[disjuntor]", message);
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
    recentUrls.push(urlOf(input));
    if (recentUrls.length > SAMPLE_SIZE) recentUrls.shift();
    // mantém só os timestamps dentro da janela
    const cutoff = now - WINDOW_MS;
    while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();

    if (timestamps.length > THRESHOLD) {
      const count = timestamps.length;
      const urls = [...recentUrls];
      cooldownUntil = now + COOLDOWN_MS;
      timestamps = [];
      recentUrls = [];
      void logDisjuntorEvento(originalFetch, count, urls);
      notifyOnce(
        "Detectamos muitas requisições repetidas e pausamos por alguns segundos. Se a tela não voltar ao normal, recarregue a página.",
      );
      return Promise.reject(new Error("Pausa automática (disjuntor): tempestade de requisições detectada."));
    }

    return originalFetch(input, init);
  };
}
