import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Detecta quando saiu um deploy novo (o arquivo JS principal mudou, já que o
 * Vite gera um nome com hash diferente a cada build) e recarrega a tela
 * sozinha, mas só num momento seguro -- nunca no meio de uma venda.
 *
 * Contexto: em 12/11/2026 a Cozinha da Ruiva ficou com uma aba aberta desde
 * antes de um deploy (correção de TEF x NFC-e) e continuou rodando o código
 * antigo o dia todo, porque nada força uma aba já aberta a atualizar. Isso
 * cobre esse buraco pra qualquer deploy futuro.
 *
 * "Momento seguro" = nenhum <Dialog> aberto (checkout, pagamento etc. usam
 * Dialog do shadcn, que renderiza com role="dialog") E sem clique/tecla nos
 * últimos 60s. Se não achar um momento seguro, só avisa e tenta de novo a
 * cada 5s até achar -- nunca interrompe à força uma venda em andamento.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_MS = 60 * 1000;
const SAFETY_POLL_MS = 5000;

// Extrai só o nome do arquivo (ex.: "index-NkBgf_lM.js"), nunca a URL
// completa -- o script já carregado na página vem como URL absoluta
// (https://.../assets/index-X.js) e o index.html buscado de novo vem como
// caminho relativo (/assets/index-X.js); comparar as duas formas inteiras
// sempre dava "diferente" mesmo sem nenhum deploy novo.
function extractBundleName(url: string): string | null {
  const m = url.match(/assets\/(index-[^"/?]+\.js)/);
  return m ? m[1] : null;
}

function getCurrentBundleSrc(): string | null {
  const script = document.querySelector('script[src*="/assets/index-"]') as HTMLScriptElement | null;
  return script ? extractBundleName(script.src) : null;
}

async function fetchLatestBundleSrc(): Promise<string | null> {
  try {
    const res = await fetch(`${window.location.origin}/?_v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/);
    return match ? extractBundleName(match[1]) : null;
  } catch {
    return null;
  }
}

function hasOpenDialog(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function useAutoVersionUpdate() {
  const pendingReloadRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const warnedRef = useRef(false);

  useEffect(() => {
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('click', markActivity);
    window.addEventListener('keydown', markActivity);

    function tryReloadIfSafe() {
      if (!pendingReloadRef.current) return;
      const idleFor = Date.now() - lastActivityRef.current;
      if (!hasOpenDialog() && idleFor >= IDLE_THRESHOLD_MS) {
        window.location.reload();
      }
    }

    const safetyTimer = window.setInterval(tryReloadIfSafe, SAFETY_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryReloadIfSafe();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const currentSrc = getCurrentBundleSrc();

    const checkTimer = window.setInterval(async () => {
      if (pendingReloadRef.current || !currentSrc) return;
      const latestSrc = await fetchLatestBundleSrc();
      if (latestSrc && latestSrc !== currentSrc) {
        pendingReloadRef.current = true;
        if (!warnedRef.current) {
          warnedRef.current = true;
          toast.info('Nova versão do sistema disponível. A tela vai atualizar sozinha assim que não houver nenhuma venda em andamento.', { duration: 10000 });
        }
        tryReloadIfSafe();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('click', markActivity);
      window.removeEventListener('keydown', markActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(safetyTimer);
      window.clearInterval(checkTimer);
    };
  }, []);
}
