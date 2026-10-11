// Regras do presente (somente perfil floricultura).
export const GIFT_CARD_MAX_CHARS = 500;

/** Turnos de 2 horas oferecidos no agendamento. */
export const FLORIST_TIME_SLOTS = [
  "08:00–10:00",
  "10:00–12:00",
  "12:00–14:00",
  "14:00–16:00",
  "16:00–18:00",
  "18:00–20:00",
] as const;

export interface GiftInput {
  isGift: boolean;
  recipientName?: string;
  recipientPhone?: string;
  cardIncluded?: boolean;
  cardMessage?: string;
  scheduledDate?: string; // YYYY-MM-DD
  scheduledSlot?: string;
}

export const normalizePhone = (p = "") => p.replace(/\D/g, "");

export function validateGift(input: GiftInput, today: string): string[] {
  const errors: string[] = [];
  if (!input.scheduledDate || input.scheduledDate < today) errors.push("Escolha uma data a partir de hoje.");
  if (!input.scheduledSlot || !(FLORIST_TIME_SLOTS as readonly string[]).includes(input.scheduledSlot))
    errors.push("Escolha um turno de entrega.");
  if (!input.isGift) return errors;
  const name = (input.recipientName ?? "").trim();
  if (name.length < 2 || /^\d+$/.test(name)) errors.push("Informe o nome de quem vai receber.");
  const phone = normalizePhone(input.recipientPhone);
  if (!/^\d{10,11}$/.test(phone) || /^(\d)\1+$/.test(phone)) errors.push("Telefone do destinatário inválido.");
  if (input.cardIncluded) {
    const msg = (input.cardMessage ?? "").trim();
    if (!msg) errors.push("Escreva a mensagem do cartão.");
    if (msg.length > GIFT_CARD_MAX_CHARS) errors.push(`Mensagem com mais de ${GIFT_CARD_MAX_CHARS} caracteres.`);
  }
  return errors;
}
