/** Detecta sessão Supabase em localStorage sem rede — bootstrap instantâneo. */
export function hasStoredSupabaseSession(): boolean {
  try {
    return Object.keys(localStorage).some(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
    );
  } catch {
    return false;
  }
}
