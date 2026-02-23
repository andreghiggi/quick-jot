import { useEffect, useRef, useCallback } from 'react';

// Generate a bell/chime notification sound using Web Audio API
function createNotificationSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Bell tone 1
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(830, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.6);

      // Bell tone 2 (higher, delayed)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.15);
      gain2.gain.setValueAtTime(0, audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.5, audioCtx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(audioCtx.currentTime + 0.15);
      osc2.stop(audioCtx.currentTime + 0.8);

      // Bell tone 3 (highest, more delayed)
      const osc3 = audioCtx.createOscillator();
      const gain3 = audioCtx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.3);
      gain3.gain.setValueAtTime(0, audioCtx.currentTime);
      gain3.gain.setValueAtTime(0.4, audioCtx.currentTime + 0.3);
      gain3.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
      osc3.connect(gain3);
      gain3.connect(audioCtx.destination);
      osc3.start(audioCtx.currentTime + 0.3);
      osc3.stop(audioCtx.currentTime + 1.0);

      // Cleanup
      setTimeout(() => audioCtx.close(), 1500);
    } catch (e) {
      console.warn('Could not play notification sound:', e);
    }
  };
}

export function useOrderNotificationSound(enabled: boolean = true) {
  const playSoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    playSoundRef.current = createNotificationSound();
    return () => { playSoundRef.current = null; };
  }, [enabled]);

  const playSound = useCallback(() => {
    if (!enabled || !playSoundRef.current) return;
    playSoundRef.current();
  }, [enabled]);

  const checkAndNotify = useCallback((currentCount: number) => {
    // Just play the sound - counting is handled externally
    playSound();
  }, [playSound]);

  return { playSound, checkAndNotify };
}
