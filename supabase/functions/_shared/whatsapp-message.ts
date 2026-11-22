export const REPLY_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const MESSAGE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

// Privacy LIDs are not phone numbers. Only a phone-address JID is safe for
// sendText, tenant locks and cooldown history; never strip @lid into digits.
export function resolveSenderPhone(key: unknown): string {
  if (!key || typeof key !== 'object') return '';
  const { remoteJid, remoteJidAlt } = key as Record<string, unknown>;
  if (typeof remoteJid !== 'string') return '';
  const jid = remoteJid.endsWith('@lid') ? remoteJidAlt : remoteJid;
  if (typeof jid !== 'string') return '';
  const match = /^(\d{7,15})(?::\d+)?@s\.whatsapp\.net$/.exec(jid);
  return match?.[1] || '';
}

const GREETING_PATTERNS = [
  /^(oie?|ola|hey|eae|eai|e ai|fala|salve|bom dia|boa tarde|boa noite|helo|hi|opa|ou|ow|ei|hei|alo|boa|bao|buenas|noite|tarde|dia|bomdia|boatarde|boanoite)\b/i,
  /^(quero|queria|gostaria).*(pedir|cardapio|menu)/i,
  /^(tem|qual).*(cardapio|menu)/i,
  /\b(pedir|pedido|fazer pedido)\b/i,
  /\b(cardapio|catalogo)\b/i,
];
export function isGreeting(message: string): boolean {
  const clean = message.trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/(.)\1{1,}/g, '$1');
  return GREETING_PATTERNS.some(pattern => pattern.test(clean));
}
export function extractMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  let current = message as Record<string, any>;
  // Bounded traversal avoids loops/malicious deeply nested payloads.
  for (let depth = 0; depth < 8; depth++) {
    const text = current.conversation || current.extendedTextMessage?.text
      || current.imageMessage?.caption || current.documentMessage?.caption || current.videoMessage?.caption;
    if (typeof text === 'string' && text.trim()) return text;
    const wrapped = current.ephemeralMessage?.message || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message || current.documentWithCaptionMessage?.message;
    if (!wrapped || typeof wrapped !== 'object') return '';
    current = wrapped;
  }
  return '';
}
export function isStaleMessage(timestamp: unknown, now = Date.now()): boolean {
  const raw = Number(timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return false;
  return now - (raw > 1e12 ? raw : raw * 1000) > MESSAGE_MAX_AGE_MS;
}
export function isLoggedOut(data: Record<string, any>): boolean {
  // Explicit WhatsApp logout reason, never an HTTP 401 from the Evolution API itself.
  const reason = data.statusReason ?? data.disconnectionReason ?? data.lastDisconnect?.error?.output?.statusCode;
  return Number(reason) === 401 || reason === 'loggedOut';
}
