/**
 * Reseller billing calculation utilities.
 */

/**
 * Calculate days in a given month (1-indexed).
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Calculate prorated monthly fee from a given start date to end of month.
 * @param monthlyFee - The full monthly fee
 * @param startDate - The activation date
 * @returns { proratedValue, remainingDays, totalDays }
 */
export function calculateProratedFee(monthlyFee: number, startDate: Date) {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + 1; // 1-indexed
  const totalDays = daysInMonth(year, month);
  const dayOfMonth = startDate.getDate();
  const remainingDays = totalDays - dayOfMonth + 1; // including start day

  const proratedValue = Math.round(((monthlyFee / totalDays) * remainingDays) * 100) / 100;

  return {
    proratedValue,
    remainingDays,
    totalDays,
  };
}

/**
 * Calculate the due date for a given month based on the reseller's configured due day.
 */
export function getInvoiceDueDate(year: number, month: number, dueDay: number): Date {
  const maxDay = daysInMonth(year, month);
  const day = Math.min(dueDay, maxDay);
  return new Date(year, month - 1, day);
}

/**
 * Format month key as 'YYYY-MM'.
 */
export function formatMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Get month label in Portuguese (e.g. "Abril 2026").
 */
export function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return `${months[month - 1]} ${year}`;
}

/**
 * Build the WhatsApp notification message for an upcoming invoice.
 */
export function buildInvoiceWhatsAppMessage(params: {
  resellerName: string;
  month: string;
  value: number;
  daysUntilDue: number;
  portalLink: string;
}): string {
  const { resellerName, month, value, daysUntilDue, portalLink } = params;
  const name = resellerName.split(' ')[0];
  const formattedValue = value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const monthLabel = getMonthLabel(month);

  if (daysUntilDue === 0) {
    return `Olá ${name}, sua fatura de ${monthLabel} no valor de R$${formattedValue} vence *hoje*. Acesse o painel para realizar o pagamento: ${portalLink}`;
  }

  const diaText = daysUntilDue === 1 ? '1 dia' : `${daysUntilDue} dias`;
  return `Olá ${name}, sua fatura de ${monthLabel} no valor de R$${formattedValue} vence em ${diaText}. Acesse o painel para realizar o pagamento: ${portalLink}`;
}
