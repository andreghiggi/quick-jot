// Pure display rule for the WhatsApp health panel.
export type HealthStatus = 'ok' | 'deaf' | 'state' | 'disconnected' | 'error';
export type DisplayStatus = HealthStatus | 'idle';

/**
 * "deaf" only means "open and no inbound for 4h". When a live check confirms the
 * session is open and recovery reports no failure, show it as idle (waiting for
 * messages) instead of alarming; a closed live state always wins.
 */
export function resolveDisplayStatus(
  status: HealthStatus,
  liveState: string | null | undefined,
  recoveryPhase: string | null | undefined,
): DisplayStatus {
  if (liveState === 'close') return 'disconnected';
  const recoveryOk = !recoveryPhase || recoveryPhase === 'ready';
  if (status === 'deaf' && liveState === 'open' && recoveryOk) return 'idle';
  if (status === 'disconnected' && liveState === 'open') return recoveryOk ? 'idle' : 'state';
  return status;
}
