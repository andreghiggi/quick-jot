import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook para tocar um sino de notificação quando chegam novos pedidos.
 *
 * Browsers modernos exigem um gesto do usuário para criar/retomar um AudioContext.
 * Como o som é disparado por evento assíncrono (realtime), criamos UM único
 * AudioContext no primeiro clique/teclado da página e o mantemos vivo.
 * Se ainda assim ele estiver "suspended" no momento do toque, tentamos resume().
 */
function playBellOn(audioCtx: AudioContext) {
  const now = audioCtx.currentTime;

  // Sino 1
  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(830, now);
  gain1.gain.setValueAtTime(0.6, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);
  osc1.start(now);
  osc1.stop(now + 0.6);

  // Sino 2
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1100, now + 0.15);
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.setValueAtTime(0.5, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.8);

  // Sino 3
  const osc3 = audioCtx.createOscillator();
  const gain3 = audioCtx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(1320, now + 0.3);
  gain3.gain.setValueAtTime(0, now);
  gain3.gain.setValueAtTime(0.4, now + 0.3);
  gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
  osc3.connect(gain3);
  gain3.connect(audioCtx.destination);
  osc3.start(now + 0.3);
  osc3.stop(now + 1.0);
}

// Singleton — um AudioContext por aba, criado no primeiro gesto
let sharedCtx: AudioContext | null = null;
let unlockListenersAttached = false;
let unlocked = false;
const unlockCallbacks = new Set<() => void>();

function getOrCreateCtx(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  try {
    sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return sharedCtx;
  } catch {
    return null;
  }
}

function attachUnlockListeners() {
  if (unlockListenersAttached || typeof window === 'undefined') return;
  unlockListenersAttached = true;

  const unlock = () => {
    const ctx = getOrCreateCtx();
    if (!ctx) return;
    const finish = () => {
      unlocked = true;
      // Notifica todos os hooks que estão escutando
      unlockCallbacks.forEach((cb) => cb());
      // Toca um silêncio inaudível para "acordar" o output em iOS
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.01);
      } catch {/* noop */}
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(finish).catch(finish);
    } else {
      finish();
    }
  };

  window.addEventListener('click', unlock, { once: false });
  window.addEventListener('touchstart', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}

export function useOrderNotificationSound(enabled: boolean = true) {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(unlocked);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    attachUnlockListeners();

    if (unlocked) {
      setIsUnlocked(true);
      return;
    }

    const cb = () => setIsUnlocked(true);
    unlockCallbacks.add(cb);
    return () => { unlockCallbacks.delete(cb); };
  }, [enabled]);

  const playSound = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = getOrCreateCtx();
    if (!ctx) {
      console.warn('[notification] AudioContext indisponível neste navegador.');
      return;
    }

    const doPlay = () => {
      try {
        playBellOn(ctx);
      } catch (e) {
        console.warn('[notification] Falha ao tocar sino:', e);
      }
    };

    if (ctx.state === 'suspended') {
      // Pode acontecer se o usuário ainda não interagiu OU o SO suspendeu a aba
      ctx.resume().then(doPlay).catch((e) => {
        console.warn('[notification] AudioContext bloqueado (sem gesto do usuário):', e);
      });
    } else {
      doPlay();
    }
  }, []);

  const checkAndNotify = useCallback((_currentCount: number) => {
    playSound();
  }, [playSound]);

  return { playSound, checkAndNotify, isUnlocked };
}
